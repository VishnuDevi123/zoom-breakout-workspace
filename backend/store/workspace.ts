import {
  ROOM_DOTS,
  type PastWorkflow,
  type WorkflowSnapshot,
  type RoundMeta,
  type RoundStatus,
  type SaveWorkspaceRequest,
  type Workspace,
  type WorkflowRoundSnapshot,
} from "../types/breakout.ts";
import { getRoundPlan, saveRoundPlan, validateRoundPlan } from "./round-plans.ts";
import { getRoundTasks, saveRoundTasks, validateRoundTasks } from "./tasks.ts";
import { addPastWorkflow } from "./templates.ts";
import { changeItem, deleteItem, deleteItems, readItem, roundItem, saveItem } from "../services/dynamo.ts";
import { HttpError, isRecord, requiredString } from "../services/http-error.ts";

// One record per meeting (item "workspace"). Room lists live in round-plans, keyed by the same roundId.
const MAX_ROUNDS = 20;
const DEFAULT_DURATION_SEC = 300;

function requiredDurationSec(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(`${field} must be a positive integer of seconds.`, 400);
  }
  return value;
}

/** null means untitled; the UI shows the position label ("Round 2") instead. */
function optionalTitle(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, field).trim();
}

async function workspaceFor(parentUUID: string): Promise<Workspace> {
  const stored = await getWorkspace(parentUUID);
  if (!stored) throw new HttpError("No workspace for this meeting.", 404);
  return stored;
}

// Highest existing number + 1, so a deleted middle round never collides with a later one.
function nextRoundId(rounds: RoundMeta[]): string {
  const highest = Math.max(
    0,
    ...rounds.map((round) => Number(round.roundId.replace("round-", ""))),
  );
  return `round-${highest + 1}`;
}

function validateSaveRequest(input: unknown): Omit<SaveWorkspaceRequest, "expectedRevision"> {
  if (!isRecord(input)) {
    throw new HttpError("The workspace must be an object.", 400);
  }
  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const title = requiredString(input.title, "title").trim();
  if (typeof input.sameRoomsEveryRound !== "boolean") {
    throw new HttpError("sameRoomsEveryRound must be a boolean.", 400);
  }
  if (typeof input.samePeopleEveryRound !== "boolean") {
    throw new HttpError("samePeopleEveryRound must be a boolean.", 400);
  }
  if (typeof input.autoStartNextRound !== "boolean") {
    throw new HttpError("autoStartNextRound must be a boolean.", 400);
  }

  if (!Array.isArray(input.rounds) || input.rounds.length > MAX_ROUNDS) {
    throw new HttpError(`rounds must contain 0 to ${MAX_ROUNDS} rounds.`, 400);
  }

  const roundIds = new Set<string>();
  const rounds = input.rounds.map((value: unknown, index: number) => {
    const field = `rounds[${index}]`;
    if (!isRecord(value)) {
      throw new HttpError(`${field} must be an object.`, 400);
    }
    const roundId = requiredString(value.roundId, `${field}.roundId`);
    if (roundIds.has(roundId)) {
      throw new HttpError("Round IDs must be unique within a workspace.", 400);
    }
    roundIds.add(roundId);
    // status and dot are server-owned: not copied even if sent.
    return {
      roundId,
      title: optionalTitle(value.title, `${field}.title`),
      durationSec: requiredDurationSec(value.durationSec, `${field}.durationSec`),
    };
  });

  return {
    parentUUID,
    title,
    sameRoomsEveryRound: input.sameRoomsEveryRound,
    rounds,
    samePeopleEveryRound: input.samePeopleEveryRound,
    autoStartNextRound: input.autoStartNextRound,
  };
}

/** GET does not create. Undefined means this meeting has no workspace yet. */
export async function getWorkspace(parentUUID: string): Promise<Workspace | undefined> {
  return readItem<Workspace>(parentUUID, "workspace");
}

/** Create (expectedRevision 0) or replace editable fields. Keeps each round's stored status and dot. */
export async function saveWorkspace(input: unknown, expectedRevision: unknown): Promise<Workspace> {
  const draft = validateSaveRequest(input);
  const stored = await getWorkspace(draft.parentUUID);

  // PUT edits rounds; it never adds or removes them. That is POST/DELETE /rounds.
  const storedRounds = stored?.rounds ?? [];
  const sameRoundSet =
    storedRounds.length === draft.rounds.length &&
    draft.rounds.every((round) => storedRounds.some((s) => s.roundId === round.roundId));
  if (stored && !sameRoundSet) {
    throw new HttpError("rounds must contain the same round IDs as the stored workspace.", 400);
  }

  const rounds: RoundMeta[] = draft.rounds.map((round, index) => {
    const previous = storedRounds.find((s) => s.roundId === round.roundId);
    return {
      ...round,
      dot: previous?.dot ?? ROOM_DOTS[index % ROOM_DOTS.length],
      status: previous?.status ?? "planned",
    };
  });

  return saveItem(draft.parentUUID, "workspace", { ...draft, rounds }, expectedRevision);
}

/** Add one round with server-assigned roundId, dot, status. */
export async function addRound(parentUUID: string, input: unknown): Promise<Workspace> {
  const stored = await workspaceFor(parentUUID);
  if (stored.rounds.length >= MAX_ROUNDS) {
    throw new HttpError(`A workspace can hold at most ${MAX_ROUNDS} rounds.`, 400);
  }
  const request = isRecord(input) ? input : {};

  const round: RoundMeta = {
    roundId: nextRoundId(stored.rounds),
    title: optionalTitle(request.title, "title"),
    durationSec:
      request.durationSec === undefined
        ? DEFAULT_DURATION_SEC
        : requiredDurationSec(request.durationSec, "durationSec"),
    dot: ROOM_DOTS[stored.rounds.length % ROOM_DOTS.length],
    status: "planned",
  };

  stored.rounds.push(round);
  return saveItem(parentUUID, "workspace", stored, stored.revision);
}

/** Remove one round and its draft. Launched rounds cannot be removed. */
export async function deleteRound(parentUUID: string, roundId: unknown): Promise<Workspace> {
  const stored = await workspaceFor(parentUUID);
  const id = requiredString(roundId, "roundId");
  const round = stored.rounds.find((r) => r.roundId === id);
  if (!round) throw new HttpError("No round with this ID.", 404);
  if (round.status === "launched") {
    throw new HttpError("A launched round cannot be deleted. Close it first.", 409);
  }

  stored.rounds = stored.rounds.filter((r) => r.roundId !== id);
  const saved = await saveItem(parentUUID, "workspace", stored, stored.revision);
  // The round's draft, task, submissions and polls or quizzes go with it.
  await deleteItems(parentUUID, roundItem(id, ""));
  return saved;
}

/** One round without people: room names from its draft, task and activities from its tasks. */
async function roundSnapshot(parentUUID: string, round: RoundMeta): Promise<WorkflowRoundSnapshot> {
  const plan = await getRoundPlan(parentUUID, round.roundId);
  const tasks = await getRoundTasks(parentUUID, round.roundId);
  return {
    title: round.title,
    durationSec: round.durationSec,
    roomNames: plan?.rooms.map((room) => room.name) ?? [],
    task: tasks?.all ?? null,
    activities: tasks?.activities ?? [],
  };
}

/** The meeting's workflow without people: what End Workflow keeps and Save as template stores. */
export async function snapshotWorkflow(parentUUID: string): Promise<WorkflowSnapshot> {
  const stored = await workspaceFor(parentUUID);
  return {
    title: stored.title,
    sameRoomsEveryRound: stored.sameRoomsEveryRound,
    samePeopleEveryRound: stored.samePeopleEveryRound,
    autoStartNextRound: stored.autoStartNextRound,
    rounds: await Promise.all(stored.rounds.map((round) => roundSnapshot(parentUUID, round))),
  };
}

/**
 * End Workflow: keep the workflow without people as a past workflow, then delete
 * the workspace and every round's draft, task and submissions. The live store's
 * participant list stays: those people are still in the meeting.
 */
export async function endWorkflow(parentUUID: string, input: unknown): Promise<PastWorkflow[]> {
  if (!isRecord(input)) throw new HttpError("The request body must be an object.", 400);
  const stored = await workspaceFor(parentUUID);
  if (stored.rounds.some((round) => round.status === "launched")) {
    throw new HttpError("Close the running round before ending the workflow.", 409);
  }

  const snapshot = await snapshotWorkflow(parentUUID);
  // Only at the revision the host saw, so a workflow changed since then is not ended.
  await deleteItem(parentUUID, "workspace", input.expectedRevision);
  await deleteItems(parentUUID, "round#");
  return addPastWorkflow(parentUUID, snapshot);
}

/** One restored round's rooms (no people) and its task, checked but not saved. A round with neither stays bare. */
function restoredRound(parentUUID: string, round: RoundMeta, position: number, snapshot: unknown) {
  const source = isRecord(snapshot) ? snapshot : {};
  const roomNames: unknown[] = Array.isArray(source.roomNames) ? source.roomNames : [];
  const activities: unknown[] = Array.isArray(source.activities) ? source.activities : [];

  const rooms = roomNames.map((name, index) => ({
    id: crypto.randomUUID(),
    name,
    dot: ROOM_DOTS[index % ROOM_DOTS.length],
    participantUUIDs: [],
  }));
  const title = round.title ?? `Round ${position}`;
  const plan =
    rooms.length > 0
      ? validateRoundPlan({ parentUUID, roundId: round.roundId, title, rooms, stayInMainParticipantUUIDs: [] })
      : null;
  const tasks =
    source.task || activities.length > 0
      ? validateRoundTasks({ parentUUID, roundId: round.roundId, all: source.task ?? null, rooms: {}, activities })
      : null;
  return { plan, tasks };
}

/**
 * Replace a workflow that has not started with a template (sample or saved).
 * Every round comes back planned, with fresh ids. The round stores validate
 * rooms and tasks; a snapshot from a past workflow already passed them once.
 */
export async function replaceWorkflow(parentUUID: string, input: unknown): Promise<Workspace> {
  if (!isRecord(input) || !isRecord(input.snapshot)) {
    throw new HttpError("The request body must be an object with a snapshot.", 400);
  }
  const stored = await getWorkspace(parentUUID);
  if (stored?.rounds.some((round) => round.status === "launched" || round.status === "closed")) {
    throw new HttpError("This workflow has started. End it before using another.", 409);
  }

  const snapshotRounds: unknown[] = Array.isArray(input.snapshot.rounds) ? input.snapshot.rounds : [];
  const draft = validateSaveRequest({
    ...input.snapshot,
    parentUUID,
    rounds: snapshotRounds.map((round, index) => ({
      ...(isRecord(round) ? round : {}),
      roundId: `round-${index + 1}`,
    })),
  });

  const rounds: RoundMeta[] = draft.rounds.map((round, index) => ({
    ...round,
    dot: ROOM_DOTS[index % ROOM_DOTS.length],
    status: "planned",
  }));
  // Every round is checked before the old workflow is deleted, so a bad snapshot changes nothing.
  const restored = rounds.map((round, index) => restoredRound(parentUUID, round, index + 1, snapshotRounds[index]));

  const saved = await saveItem(parentUUID, "workspace", { ...draft, rounds }, input.expectedRevision);
  await deleteItems(parentUUID, "round#");
  for (const { plan, tasks } of restored) {
    if (plan) await saveRoundPlan(plan, 0);
    if (tasks) await saveRoundTasks(tasks, 0);
  }
  return saved;
}

/** Called by /api/live/launch and /close. No change when workspace or round is unknown: launch never gates on the workspace. */
export async function markRoundStatus(parentUUID: string, roundId: string, status: RoundStatus): Promise<void> {
  await changeItem<Workspace>(parentUUID, "workspace", (stored) => {
    const round = stored?.rounds.find((r) => r.roundId === roundId);
    if (!round) return null;
    round.status = status;
    return stored!;
  });
}
