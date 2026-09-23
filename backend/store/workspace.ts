import {
  ROOM_DOTS,
  type RoundMeta,
  type RoundStatus,
  type SaveWorkspaceRequest,
  type Workspace,
} from "../types/breakout.ts";
import { deleteRoundPlan } from "./round-plans.ts";
import { deleteRoundTasks } from "./tasks.ts";

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
  deleteRoundPlan(stored.parentUUID, id);
  deleteRoundTasks(stored.parentUUID, id);
  return structuredClone(stored);
}

/** Called by /api/live/launch and /close. No operatuions when workspace or round is unknown: launch never gates on the workspace. */
export function markRoundStatus(parentUUID: string, roundId: string, status: RoundStatus): void {
  const round = workspaces.get(parentUUID)?.rounds.find((r) => r.roundId === roundId);
  if (!round) return;
  round.status = status;
  workspaces.get(parentUUID)!.revision += 1;
}
