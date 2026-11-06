import {
  NOTE_COLORS,
  type AnswerStatus,
  type IndividualAnswer,
  type RoomResponses,
  type RoomResponsesHostView,
  type RoomResponsesView,
  type RoundTasks,
} from "../types/breakout.ts";
import { bumpRoomRevision, getLive } from "./live.ts";
import { getRoundPlan } from "./round-plans.ts";
import { changeItem, readItem, readItems, roundItem } from "../services/dynamo.ts";
import { HttpError, isRecord, requiredString } from "../services/http-error.ts";

// What participants wrote: individual answers, idea notes and checklist
// ticks. One record per room (item "round#<roundId>#room#<roomId>").
//
// The activity definitions live in store/tasks.ts. The route checks that an activity
// or checklist item exists before calling a write here.

const MAX_ANSWER_LENGTH = 2000;
const MAX_NOTE_TITLE_LENGTH = 100;
const MAX_NOTE_DESCRIPTION_LENGTH = 1000;
const MAX_NOTES_PER_BOARD = 50;

/** One room in one round of one meeting. Every function here works on one room. */
export interface RoomRef {
  parentUUID: string;
  roundId: string;
  roomId: string;
}

function itemOf({ roundId, roomId }: RoomRef): string {
  return roundItem(roundId, "room", roomId);
}

/** Trimmed text of at most `max` characters. Empty only when `allowEmpty`. */
function boundedText(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > max) {
    throw new HttpError(`${field} must be a string of at most ${max} characters.`, 400);
  }
  const text = value.trim();
  if (!allowEmpty && text.length === 0) throw new HttpError(`${field} must not be empty.`, 400);
  return text;
}

/**
 * The host's draft is the only record of who belongs in which room. The ids are
 * the planned room ids (PlannedRoom.id), not Zoom's breakout room uuids.
 */
export async function assertInRoom(room: RoomRef, participantUUID: string): Promise<void> {
  const plannedRoom = (await getRoundPlan(room.parentUUID, room.roundId))?.rooms.find(
    (candidate) => candidate.id === room.roomId,
  );
  if (!plannedRoom) throw new HttpError("No such room in this round.", 404);
  if (!plannedRoom.participantUUIDs.includes(participantUUID)) {
    throw new HttpError("You are not in this room.", 403);
  }
}

/** Reads participantUUID from a write body and checks the caller belongs in the room. */
async function callerIn(room: RoomRef, request: unknown): Promise<{ participantUUID: string; body: Record<string, unknown> }> {
  if (!isRecord(request)) throw new HttpError("The request body must be an object.", 400);
  const participantUUID = requiredString(request.participantUUID, "participantUUID");
  await assertInRoom(room, participantUUID);
  return { participantUUID, body: request };
}

/** Display name from the webhook-fed live store, which may not know someone yet, hence the fallback. */
async function authorName(parentUUID: string, participantUUID: string): Promise<string> {
  const participant = (await getLive(parentUUID)).participants.find((p) => p.participantUUID === participantUUID);
  return participant?.name || "Participant";
}

function emptyRecord(room: RoomRef): RoomResponses {
  return { ...room, answers: {}, ideas: {}, ticks: {}, ideaCounters: {} };
}

/**
 * Every write goes through here: one change at a time per room, creating the record
 * on its first write. Tells the room's participants to refetch; returns the caller's view.
 */
async function changeRoom(
  room: RoomRef,
  participantUUID: string,
  change: (record: RoomResponses) => void,
): Promise<RoomResponsesView> {
  const saved = await changeItem<RoomResponses>(room.parentUUID, itemOf(room), (current) => {
    const record = current ?? emptyRecord(room);
    change(record);
    return record;
  });
  await bumpRoomRevision(room.parentUUID, room.roomId);
  return viewFor(saved ?? emptyRecord(room), participantUUID);
}

/**
 * What one participant may see. Notes and ticks are shared with
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
    if (mine) myAnswers[activityId] = mine;
  }

  return {
    parentUUID: record.parentUUID,
    roundId: record.roundId,
    roomId: record.roomId,
    ideas: record.ideas,
    ticks: record.ticks,
    myAnswers,
    statuses,
  };
}

/** The caller's view of the room. A room nobody has written to yet returns an empty view, not a 404. */
export async function getRoomResponses(room: RoomRef, participantUUID: unknown): Promise<RoomResponsesView> {
  const caller = requiredString(participantUUID, "participantUUID");
  await assertInRoom(room, caller);
  return viewFor((await readItem<RoomResponses>(room.parentUUID, itemOf(room))) ?? emptyRecord(room), caller);
}

/**
 * The host's view of a room, the counterpart of `viewFor`. Every answer is listed,
 * but drafts stay private: a "working" answer comes back with its status and no
 * text. ideaCounters is server bookkeeping and is left out.
 */
export async function getRoomResponsesForHost(room: RoomRef): Promise<RoomResponsesHostView> {
  const record = (await readItem<RoomResponses>(room.parentUUID, itemOf(room))) ?? emptyRecord(room);
  const answers: RoomResponsesHostView["answers"] = {};
  for (const [activityId, byParticipant] of Object.entries(record.answers)) {
    answers[activityId] = {};
    for (const answer of Object.values(byParticipant)) {
      answers[activityId][answer.participantUUID] = {
        ...answer,
        text: answer.status === "submitted" ? answer.text : "",
      };
    }
  }

  return {
    parentUUID: record.parentUUID,
    roundId: record.roundId,
    roomId: record.roomId,
    answers,
    ideas: record.ideas,
    ticks: record.ticks,
  };
}

/**
 * Autosave sends status "working", "Submit to host" sends "submitted". Either
 * replaces the text, so editing after a submit sets the status back to working.
 * A "working" save with empty text removes the answer: an emptied box is "not started".
 */
export async function submitAnswer(room: RoomRef, activityId: string, request: unknown): Promise<RoomResponsesView> {
  const { participantUUID, body } = await callerIn(room, request);
  if (body.status !== "working" && body.status !== "submitted") {
    throw new HttpError('status must be "working" or "submitted".', 400);
  }
  const status: AnswerStatus = body.status;
  const text = boundedText(body.text, "text", MAX_ANSWER_LENGTH, status === "working");

  return changeRoom(room, participantUUID, (record) => {
    const answers = (record.answers[activityId] ??= {});
    if (text) {
      answers[participantUUID] = { participantUUID, text, status };
    } else {
      delete answers[participantUUID];
    }
  });
}

/** New sticky note. The server picks its id, its "Idea N" title, its author name and its color. */
export async function addIdea(room: RoomRef, activityId: string, request: unknown): Promise<RoomResponsesView> {
  const { participantUUID, body } = await callerIn(room, request);
  const description = boundedText(body.description, "description", MAX_NOTE_DESCRIPTION_LENGTH);
  const author = await authorName(room.parentUUID, participantUUID);

  return changeRoom(room, participantUUID, (record) => {
    const notes = (record.ideas[activityId] ??= []);
    if (notes.length >= MAX_NOTES_PER_BOARD) {
      throw new HttpError(`A board holds at most ${MAX_NOTES_PER_BOARD} notes.`, 400);
    }
    // A counter, not notes.length: after a removal, length + 1 would repeat a title.
    const number = (record.ideaCounters[activityId] ?? 0) + 1;
    record.ideaCounters[activityId] = number;
    notes.push({
      id: crypto.randomUUID(),
      participantUUID,
      authorName: author,
      title: `Idea ${number}`,
      description,
      color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
    });
  });
}

/** The note's board and index; 404 when missing, 403 when the caller did not write it. */
function findOwnNote(record: RoomResponses, activityId: string, noteId: string, participantUUID: string) {
  const notes = record.ideas[activityId] ?? [];
  const index = notes.findIndex((note) => note.id === noteId);
  if (index === -1) throw new HttpError("No such note on this board.", 404);
  if (notes[index].participantUUID !== participantUUID) {
    throw new HttpError("Only the note's author can change it.", 403);
  }
  return { notes, index };
}

/** Author only. Title and description are both replaced; color and author stay. */
export async function editIdea(room: RoomRef, activityId: string, noteId: string, request: unknown): Promise<RoomResponsesView> {
  const { participantUUID, body } = await callerIn(room, request);
  const title = boundedText(body.title, "title", MAX_NOTE_TITLE_LENGTH);
  const description = boundedText(body.description, "description", MAX_NOTE_DESCRIPTION_LENGTH);

  return changeRoom(room, participantUUID, (record) => {
    const { notes, index } = findOwnNote(record, activityId, noteId, participantUUID);
    notes[index].title = title;
    notes[index].description = description;
  });
}

/** Author only. */
export async function removeIdea(room: RoomRef, activityId: string, noteId: string, request: unknown): Promise<RoomResponsesView> {
  const { participantUUID } = await callerIn(room, request);
  return changeRoom(room, participantUUID, (record) => {
    const { notes, index } = findOwnNote(record, activityId, noteId, participantUUID);
    notes.splice(index, 1);
  });
}

/** Anyone in the room ticks or unticks any item; the latest click wins. */
export async function setTick(room: RoomRef, itemId: string, request: unknown): Promise<RoomResponsesView> {
  const { participantUUID, body } = await callerIn(room, request);
  const done = body.done;
  if (typeof done !== "boolean") throw new HttpError("done must be true or false.", 400);

  return changeRoom(room, participantUUID, (record) => {
    if (done) {
      record.ticks[itemId] = true;
    } else {
      delete record.ticks[itemId];
    }
  });
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
export async function pruneResponses(tasks: RoundTasks): Promise<void> {
  const individualIds = new Set(tasks.activities.filter((a) => a.kind === "individual").map((a) => a.id));
  const boardIds = new Set(tasks.activities.filter((a) => a.kind === "ideaBoard").map((a) => a.id));
  const records = await readItems<RoomResponses>(tasks.parentUUID, roundItem(tasks.roundId, "room", ""));

  for (const { roomId } of records) {
    const checklist = (tasks.rooms[roomId] ?? tasks.all)?.checklist ?? [];
    const itemIds = new Set(checklist.map((item) => item.id));
    let removed = false;
    await changeItem<RoomResponses>(tasks.parentUUID, roundItem(tasks.roundId, "room", roomId), (record) => {
      if (!record) return null;
      removed = [
        keepOnly(record.answers, individualIds),
        keepOnly(record.ideas, boardIds),
        keepOnly(record.ideaCounters, boardIds),
        keepOnly(record.ticks, itemIds),
      ].some(Boolean);
      return removed ? record : null;
    });
    if (removed) await bumpRoomRevision(tasks.parentUUID, roomId);
  }
}
