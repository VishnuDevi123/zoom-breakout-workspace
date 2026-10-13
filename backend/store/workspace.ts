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
import { deleteRoundResponses } from "./activity_responses.ts";
import { deleteRoundPlan, getRoundPlan, saveRoundPlan } from "./round-plans.ts";
import { deleteRoundTasks, getRoundTasks, saveRoundTasks } from "./tasks.ts";
import { addPastWorkflow } from "./templates.ts";

// One record per meeting. Room lists live in round-plans, keyed by the same roundId.
const workspaces = new Map<string, Workspace>();
const MAX_ROUNDS = 20;
const DEFAULT_DURATION_SEC = 300;

export class WorkspaceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WorkspaceError(`${field} must be a non-empty string.`, 400);
  }
  // IDs are opaque: validate without rewriting them. Names/titles are trimmed below.
  return value;
}

function requiredDurationSec(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new WorkspaceError(`${field} must be a positive integer of seconds.`, 400);
  }
  return value;
}

/** null means untitled; the UI shows the position label ("Round 2") instead. */
function optionalTitle(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, field).trim();
}

function workspaceFor(parentUUID: unknown): Workspace {
  const stored = workspaces.get(requiredString(parentUUID, "parentUUID"));
  if (!stored) throw new WorkspaceError("No workspace for this meeting.", 404);
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
    throw new WorkspaceError("The workspace must be an object.", 400);
  }
  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const title = requiredString(input.title, "title").trim();
  if (typeof input.sameRoomsEveryRound !== "boolean") {
    throw new WorkspaceError("sameRoomsEveryRound must be a boolean.", 400);
  }
  if (typeof input.samePeopleEveryRound !== "boolean") {
    throw new WorkspaceError("samePeopleEveryRound must be a boolean.", 400);
  }
  if (typeof input.autoStartNextRound !== "boolean") {
    throw new WorkspaceError("autoSaveNextRound must be a boolean.", 400);
  }

  if (!Array.isArray(input.rounds) || input.rounds.length > MAX_ROUNDS) {
    throw new WorkspaceError(`rounds must contain 0 to ${MAX_ROUNDS} rounds.`, 400);
  }

  const roundIds = new Set<string>();
  const rounds = input.rounds.map((value: unknown, index: number) => {
    const field = `rounds[${index}]`;
    if (!isRecord(value)) {
      throw new WorkspaceError(`${field} must be an object.`, 400);
    }
    const roundId = requiredString(value.roundId, `${field}.roundId`);
    if (roundIds.has(roundId)) {
      throw new WorkspaceError("Round IDs must be unique within a workspace.", 400);
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

function checkRevision(stored: Workspace | undefined, expectedRevision: unknown): number {
  if (
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new WorkspaceError("expectedRevision must be a non-negative safe integer.", 400);
  }
  const currentRevision = stored?.revision ?? 0;
  if (expectedRevision !== currentRevision) {
    throw new WorkspaceError(
      `The workspace changed. Expected revision ${expectedRevision}, but current revision is ${currentRevision}. Reload before saving again.`,
      409,
    );
  }
  return currentRevision;
}

/** GET does not create. Undefined means this meeting has no workspace yet. */
export function getWorkspace(parentUUID: unknown): Workspace | undefined {
  const stored = workspaces.get(requiredString(parentUUID, "parentUUID"));
  return stored ? structuredClone(stored) : undefined;
}

/** Create (expectedRevision 0) or replace editable fields. Keeps each round's stored status and dot. */
export function saveWorkspace(input: unknown, expectedRevision: unknown): Workspace {
  const draft = validateSaveRequest(input);
  const stored = workspaces.get(draft.parentUUID);
  const currentRevision = checkRevision(stored, expectedRevision);

  // PUT edits rounds; it never adds or removes them. That is POST/DELETE /rounds.
  const storedRounds = stored?.rounds ?? [];
  const sameRoundSet =
    storedRounds.length === draft.rounds.length &&
    draft.rounds.every((round) => storedRounds.some((s) => s.roundId === round.roundId));
  if (stored && !sameRoundSet) {
    throw new WorkspaceError("rounds must contain the same round IDs as the stored workspace.", 400);
  }

  const rounds: RoundMeta[] = draft.rounds.map((round, index) => {
    const previous = storedRounds.find((s) => s.roundId === round.roundId);
    return {
      ...round,
      dot: previous?.dot ?? ROOM_DOTS[index % ROOM_DOTS.length],
      status: previous?.status ?? "planned",
    };
  });

  const saved: Workspace = { ...draft, rounds, revision: currentRevision + 1 };
  workspaces.set(saved.parentUUID, saved);
  return structuredClone(saved);
}

/** Add one round with server-assigned roundId, dot, status. */
export function addRound(parentUUID: unknown, input: unknown): Workspace {
  const stored = workspaceFor(parentUUID);
  if (stored.rounds.length >= MAX_ROUNDS) {
    throw new WorkspaceError(`A workspace can hold at most ${MAX_ROUNDS} rounds.`, 400);
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
  stored.revision += 1;
  return structuredClone(stored);
}

/** Remove one round and its draft. Launched rounds cannot be removed. */
export function deleteRound(parentUUID: unknown, roundId: unknown): Workspace {
  const stored = workspaceFor(parentUUID);
  const id = requiredString(roundId, "roundId");
  const round = stored.rounds.find((r) => r.roundId === id);
  if (!round) throw new WorkspaceError("No round with this ID.", 404);
  if (round.status === "launched") {
    throw new WorkspaceError("A launched round cannot be deleted. Close it first.", 409);
  }

  stored.rounds = stored.rounds.filter((r) => r.roundId !== id);
  stored.revision += 1;
  deleteRoundData(stored.parentUUID, id);
  return structuredClone(stored);
}

/** A round's draft, task and submissions, which every removal takes along. */
function deleteRoundData(parentUUID: string, roundId: string): void {
  deleteRoundPlan(parentUUID, roundId);
  deleteRoundTasks(parentUUID, roundId);
  deleteRoundResponses(parentUUID, roundId);
}

/** One round without people: room names from its draft, task and activities from its tasks. */
function roundSnapshot(parentUUID: string, round: RoundMeta): WorkflowRoundSnapshot {
  const plan = getRoundPlan(parentUUID, round.roundId);
  const tasks = getRoundTasks(parentUUID, round.roundId);
  return {
    title: round.title,
    durationSec: round.durationSec,
    roomNames: plan?.rooms.map((room) => room.name) ?? [],
    task: tasks?.all ?? null,
    activities: tasks?.activities ?? [],
  };
}

/** The meeting's workflow without people: what End Workflow keeps and Save as template stores. */
export function snapshotWorkflow(parentUUID: unknown): WorkflowSnapshot {
  const stored = workspaceFor(parentUUID);
  return {
    title: stored.title,
    sameRoomsEveryRound: stored.sameRoomsEveryRound,
    samePeopleEveryRound: stored.samePeopleEveryRound,
    autoStartNextRound: stored.autoStartNextRound,
    rounds: stored.rounds.map((round) => roundSnapshot(stored.parentUUID, round)),
  };
}

/**
 * End Workflow: keep the workflow without people as a past workflow, then delete
 * the workspace and every round's draft, task and submissions. The live store's
 * participant list stays: those people are still in the meeting.
 */
export function endWorkflow(input: unknown): PastWorkflow[] {
  if (!isRecord(input)) throw new WorkspaceError("The request body must be an object.", 400);
  const stored = workspaceFor(input.parentUUID);
  checkRevision(stored, input.expectedRevision);
  if (stored.rounds.some((round) => round.status === "launched")) {
    throw new WorkspaceError("Close the running round before ending the workflow.", 409);
  }

  const snapshot = snapshotWorkflow(stored.parentUUID);
  for (const round of stored.rounds) deleteRoundData(stored.parentUUID, round.roundId);
  workspaces.delete(stored.parentUUID);
  return addPastWorkflow(stored.parentUUID, snapshot);
}

/** Saves one restored round's rooms (no people) and its task. A round with neither stays bare. */
function restoreRound(parentUUID: string, round: RoundMeta, position: number, snapshot: unknown): void {
  const source = isRecord(snapshot) ? snapshot : {};
  const roomNames: unknown[] = Array.isArray(source.roomNames) ? source.roomNames : [];
  const activities: unknown[] = Array.isArray(source.activities) ? source.activities : [];

  if (roomNames.length > 0) {
    const rooms = roomNames.map((name, index) => ({
      id: crypto.randomUUID(),
      name,
      dot: ROOM_DOTS[index % ROOM_DOTS.length],
      participantUUIDs: [],
    }));
    const title = round.title ?? `Round ${position}`;
    saveRoundPlan({ parentUUID, roundId: round.roundId, title, rooms, stayInMainParticipantUUIDs: [] }, 0);
  }
  if (source.task || activities.length > 0) {
    saveRoundTasks({ parentUUID, roundId: round.roundId, all: source.task ?? null, rooms: {}, activities }, 0);
  }
}

/**
 * Replace a workflow that has not started with a template (sample or saved).
 * Every round comes back planned, with fresh ids. The round stores validate
 * rooms and tasks; a snapshot from a past workflow already passed them once.
 */
export function replaceWorkflow(input: unknown): Workspace {
  if (!isRecord(input) || !isRecord(input.snapshot)) {
    throw new WorkspaceError("The request body must be an object with a snapshot.", 400);
  }
  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const stored = workspaces.get(parentUUID);
  const currentRevision = checkRevision(stored, input.expectedRevision);
  if (stored?.rounds.some((round) => round.status === "launched" || round.status === "closed")) {
    throw new WorkspaceError("This workflow has started. End it before using another.", 409);
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

  for (const round of stored?.rounds ?? []) deleteRoundData(parentUUID, round.roundId);
  const saved: Workspace = {
    ...draft,
    rounds: draft.rounds.map((round, index) => ({
      ...round,
      dot: ROOM_DOTS[index % ROOM_DOTS.length],
      status: "planned",
    })),
    revision: currentRevision + 1,
  };
  workspaces.set(parentUUID, saved);
  saved.rounds.forEach((round, index) => restoreRound(parentUUID, round, index + 1, snapshotRounds[index]));
  return structuredClone(saved);
}

/** Called by /api/live/launch and /close. No operatuions when workspace or round is unknown: launch never gates on the workspace. */
export function markRoundStatus(parentUUID: string, roundId: string, status: RoundStatus): void {
  const round = workspaces.get(parentUUID)?.rounds.find((r) => r.roundId === roundId);
  if (!round) return;
  round.status = status;
  workspaces.get(parentUUID)!.revision += 1;
}
