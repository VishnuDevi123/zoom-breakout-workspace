import {
  NOTE_COLORS,
  type AnswerStatus,
  type IndividualAnswer,
  type RoomResponses,
  type RoomResponsesView,
  type RoundTasks,
} from "../types/breakout.ts";
import { bumpRoomRevision, getLive } from "./live.ts";
import { getRoundPlan } from "./round-plans.ts";

// What participants wrote: individual answers, idea notes, ready marks and
// checklist ticks. One record per (parentUUID, roundId, roomId).
//
// The activity definitions live in store/tasks.ts. The route checks that an activity or checklist item exists before calling a write here, so this store

const responses = new Map<string, RoomResponses>();

const MAX_ANSWER_LENGTH = 2000;
const MAX_NOTE_TITLE_LENGTH = 100;
const MAX_NOTE_DESCRIPTION_LENGTH = 1000;
const MAX_NOTES_PER_BOARD = 50;

export class ResponseError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
    this.name = "ResponseError";
  }
}

/** One room in one round of one meeting. Every function here works on one room. */
export interface RoomRef {
  parentUUID: string;
  roundId: string;
  roomId: string;
}

function key({ parentUUID, roundId, roomId }: RoomRef): string {
  return `${parentUUID}:${roundId}:${roomId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ResponseError(`${field} must be a non-empty string.`, 400);
  }
  return value;
}

/** Trimmed text of at most `max` characters. Empty only when `allowEmpty`. */
function boundedText(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > max) {
    throw new ResponseError(`${field} must be a string of at most ${max} characters.`, 400);
  }
  const text = value.trim();
  if (!allowEmpty && text.length === 0) throw new ResponseError(`${field} must not be empty.`, 400);
  return text;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new ResponseError(`${field} must be true or false.`, 400);
  return value;
}

/** Checks the three ids that name a room. Values come from the URL and the body or query. */
export function parseRoom(input: { parentUUID: unknown; roundId: unknown; roomId: unknown }): RoomRef {
  return {
    parentUUID: requiredString(input.parentUUID, "parentUUID"),
    roundId: requiredString(input.roundId, "roundId"),
    roomId: requiredString(input.roomId, "roomId"),
  };
}

/**
 * The host's draft is the only record of who belongs in which room. The ids are
 * the planned room ids (PlannedRoom.id), not Zoom's breakout room uuids.
 */
function assertInRoom(room: RoomRef, participantUUID: string): void {
  const plannedRoom = getRoundPlan(room.parentUUID, room.roundId)?.rooms.find(
    (candidate) => candidate.id === room.roomId,
  );
  if (!plannedRoom) throw new ResponseError("No such room in this round.", 404);
  if (!plannedRoom.participantUUIDs.includes(participantUUID)) {
    throw new ResponseError("You are not in this room.", 403);
  }
}

/** Reads participantUUID from a write body and checks the caller belongs in the room. */
function callerIn(room: RoomRef, request: unknown): { participantUUID: string; body: Record<string, unknown> } {
  if (!isRecord(request)) throw new ResponseError("The request body must be an object.", 400);
  const participantUUID = requiredString(request.participantUUID, "participantUUID");
  assertInRoom(room, participantUUID);
  return { participantUUID, body: request };
}

/** Display name from the webhook-fed live store; a restart empties it, hence the fallback. */
function authorName(parentUUID: string, participantUUID: string): string {
  const participant = getLive(parentUUID).participants.find((p) => p.participantUUID === participantUUID);
  return participant?.name || "Participant";
}

function emptyRecord(room: RoomRef): RoomResponses {
  return { ...room, answers: {}, ideas: {}, ready: {}, ticks: {}, ideaCounters: {} };
}

/** Get-or-create. Only writes call this, so a GET never stores an empty record. */
function recordFor(room: RoomRef): RoomResponses {
  const existing = responses.get(key(room));
  if (existing) return existing;
  const created = emptyRecord(room);
  responses.set(key(room), created);
  return created;
}

/**
 * What one participant may see. Notes, ready marks and ticks are shared with
 * the room. Answers are private: the caller gets their own in full and only the
 * status of everyone else's. ideaCounters is server bookkeeping and is left out.
 */
function viewFor(record: RoomResponses, participantUUID: string): RoomResponsesView {
  const myAnswers: Record<string, IndividualAnswer> = {};
  const statuses: Record<string, Record<string, AnswerStatus>> = {};

  for (const [activityId, byParticipant] of Object.entries(record.answers)) {
    statuses[activityId] = {};
    for (const answer of Object.values(byParticipant)) {
      statuses[activityId][answer.participantUUID] = answer.status;
    }
    const mine = byParticipant[participantUUID];
    if (mine) myAnswers[activityId] = { ...mine };
  }

  return {
    parentUUID: record.parentUUID,
    roundId: record.roundId,
    roomId: record.roomId,
    ideas: structuredClone(record.ideas),
    ready: structuredClone(record.ready),
    ticks: structuredClone(record.ticks),
    myAnswers,
    statuses,
  };
}

/** Every write ends here: tell the room's participants to refetch, return the caller's view. */
function changed(record: RoomResponses, participantUUID: string): RoomResponsesView {
  bumpRoomRevision(record.parentUUID, record.roomId);
  return viewFor(record, participantUUID);
}


/** The caller's view of the room. A room nobody has written to yet returns an empty view, not a 404. */
export function getRoomResponses(room: RoomRef, participantUUID: unknown): RoomResponsesView {
  const caller = requiredString(participantUUID, "participantUUID");
  assertInRoom(room, caller);
  return viewFor(responses.get(key(room)) ?? emptyRecord(room), caller);
}


/**
 * Autosave sends status "working", "Submit to host" sends "submitted". Either
 * replaces the text, so editing after a submit sets the status back to working.
 * A "working" save with empty text removes the answer: an emptied box is "not started".
 */
export function submitAnswer(room: RoomRef, activityId: string, request: unknown): RoomResponsesView {
  const { participantUUID, body } = callerIn(room, request);
  if (body.status !== "working" && body.status !== "submitted") {
    throw new ResponseError('status must be "working" or "submitted".', 400);
  }
  const status: AnswerStatus = body.status;
  const text = boundedText(body.text, "text", MAX_ANSWER_LENGTH, status === "working");

  const record = recordFor(room);
  const answers = (record.answers[activityId] ??= {});
  if (text) {
    answers[participantUUID] = { participantUUID, text, status };
  } else {
    delete answers[participantUUID];
  }
  return changed(record, participantUUID);
}

/** New sticky note. The server picks its id, its "Idea N" title, its author name and its color. */
export function addIdea(room: RoomRef, activityId: string, request: unknown): RoomResponsesView {
  const { participantUUID, body } = callerIn(room, request);
  const description = boundedText(body.description, "description", MAX_NOTE_DESCRIPTION_LENGTH);

  const record = recordFor(room);
  const notes = (record.ideas[activityId] ??= []);
  if (notes.length >= MAX_NOTES_PER_BOARD) {
    throw new ResponseError(`A board holds at most ${MAX_NOTES_PER_BOARD} notes.`, 400);
  }
  // A counter, not notes.length: after a removal, length + 1 would repeat a title.
  const number = (record.ideaCounters[activityId] ?? 0) + 1;
  record.ideaCounters[activityId] = number;

  notes.push({
    id: crypto.randomUUID(),
    participantUUID,
    authorName: authorName(room.parentUUID, participantUUID),
    title: `Idea ${number}`,
    description,
    color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
  });
  return changed(record, participantUUID);
}

/** The room's record and the note's index on its board; 404 when missing, 403 when the caller did not write it. */
function findOwnNote(room: RoomRef, activityId: string, noteId: string, participantUUID: string) {
  const record = responses.get(key(room));
  const notes = record?.ideas[activityId];
  const index = notes?.findIndex((note) => note.id === noteId) ?? -1;
  if (!record || !notes || index === -1) throw new ResponseError("No such note on this board.", 404);
  if (notes[index].participantUUID !== participantUUID) {
    throw new ResponseError("Only the note's author can change it.", 403);
  }
  return { record, notes, index };
}

/** Author only. Title and description are both replaced; color and author stay. */
export function editIdea(room: RoomRef, activityId: string, noteId: string, request: unknown): RoomResponsesView {
  const { participantUUID, body } = callerIn(room, request);
  const title = boundedText(body.title, "title", MAX_NOTE_TITLE_LENGTH);
  const description = boundedText(body.description, "description", MAX_NOTE_DESCRIPTION_LENGTH);

  const { record, notes, index } = findOwnNote(room, activityId, noteId, participantUUID);
  const note = notes[index];
  note.title = title;
  note.description = description;
  return changed(record, participantUUID);
}

/** Author only. */
export function removeIdea(room: RoomRef, activityId: string, noteId: string, request: unknown): RoomResponsesView {
  const { participantUUID } = callerIn(room, request);
  const { record, notes, index } = findOwnNote(room, activityId, noteId, participantUUID);
  notes.splice(index, 1);
  return changed(record, participantUUID);
}

/** "Mark me ready" on an idea board. Can be undone; it does not stop anyone adding notes. */
export function markReady(room: RoomRef, activityId: string, request: unknown): RoomResponsesView {
  const { participantUUID, body } = callerIn(room, request);
  const ready = requiredBoolean(body.ready, "ready");

  const record = recordFor(room);
  const others = (record.ready[activityId] ?? []).filter((id) => id !== participantUUID);
  record.ready[activityId] = ready ? [...others, participantUUID] : others;
  return changed(record, participantUUID);
}

/** Anyone in the room ticks or unticks any item; the latest click wins. */
export function setTick(room: RoomRef, itemId: string, request: unknown): RoomResponsesView {
  const { participantUUID, body } = callerIn(room, request);
  const done = requiredBoolean(body.done, "done");

  const record = recordFor(room);
  if (done) {
    record.ticks[itemId] = { participantUUID, authorName: authorName(room.parentUUID, participantUUID) };
  } else {
    delete record.ticks[itemId];
  }
  return changed(record, participantUUID);
}


/** Deletes every key of `entries` not in `keep`. True when something was removed. */
function keepOnly(entries: Record<string, unknown>, keep: Set<string>): boolean {
  let removed = false;
  for (const id of Object.keys(entries)) {
    if (!keep.has(id)) {
      delete entries[id];
      removed = true;
    }
  }
  return removed;
}

/**
 * Called by saveRoundTasks after every task save. Drops what rooms wrote for
 * any activity the host removed (or changed to the other kind), and ticks for
 * checklist items no longer in that room's task, so no response outlives what
 * it answered. Rooms that lost something are told to refetch.
 */
export function pruneResponses(tasks: RoundTasks): void {
  const individualIds = new Set(tasks.activities.filter((a) => a.kind === "individual").map((a) => a.id));
  const boardIds = new Set(tasks.activities.filter((a) => a.kind === "ideaBoard").map((a) => a.id));

  for (const record of responses.values()) {
    if (record.parentUUID !== tasks.parentUUID || record.roundId !== tasks.roundId) continue;
    const checklist = (tasks.rooms[record.roomId] ?? tasks.all)?.checklist ?? [];
    const itemIds = new Set(checklist.map((item) => item.id));

    const removed = [
      keepOnly(record.answers, individualIds),
      keepOnly(record.ideas, boardIds),
      keepOnly(record.ready, boardIds),
      keepOnly(record.ideaCounters, boardIds),
      keepOnly(record.ticks, itemIds),
    ].some(Boolean);
    if (removed) bumpRoomRevision(record.parentUUID, record.roomId);
  }
}

/** Called by deleteRound in store/workspace.ts, next to deleteRoundPlan and deleteRoundTasks. */
export function deleteRoundResponses(parentUUID: string, roundId: string): void {
  for (const [recordKey, record] of responses) {
    if (record.parentUUID === parentUUID && record.roundId === roundId) responses.delete(recordKey);
  }
}
