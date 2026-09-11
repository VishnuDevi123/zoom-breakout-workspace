import {
  ROOM_DOTS,
  type PlannedRoom,
  type RoomDot,
  type RoundPlan,
  type RoundPlanDraft,
} from "../types/breakout.ts";

// Week 3 storage survives browser reloads, but not a backend restart.
// A database can replace this Map without changing the frontend's API.
// Draft storage deliberately never imports or writes to the live snapshot store.
const plans = new Map<string, RoundPlan>();

// Match the current editor's limit. Apply must still check the Zoom client.
const MAX_PLANNED_ROOMS = 50;

export class RoundPlanError extends Error {
  constructor(message: string, readonly status: 400 | 409) {
    super(message);
    this.name = "RoundPlanError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RoundPlanError(`${field} must be a non-empty string.`, 400);
  }
  // IDs are opaque: validate without rewriting them. Names/titles are trimmed below.
  return value;
}

function planKey(parentUUID: unknown, roundId: unknown): string {
  // A tuple avoids delimiter collisions: ["a:b", "c"] differs from ["a", "b:c"].
  return JSON.stringify([
    requiredString(parentUUID, "parentUUID"),
    requiredString(roundId, "roundId"),
  ]);
}

function validateDraft(input: unknown): RoundPlanDraft {
  if (!isRecord(input)) {
    throw new RoundPlanError("The round plan must be an object.", 400);
  }

  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const roundId = requiredString(input.roundId, "roundId");
  const title = requiredString(input.title, "title").trim();
  if (!Array.isArray(input.rooms) || input.rooms.length < 1 || input.rooms.length > MAX_PLANNED_ROOMS) {
    throw new RoundPlanError(`rooms must contain 1 to ${MAX_PLANNED_ROOMS} rooms.`, 400);
  }

  const roomIds = new Set<string>();
  const roomNames = new Set<string>();
  const assignedParticipants = new Set<string>();
  const rooms: PlannedRoom[] = input.rooms.map((value: unknown, index: number) => {
    const field = `rooms[${index}]`;
    if (!isRecord(value)) {
      throw new RoundPlanError(`${field} must be an object.`, 400);
    }

    const id = requiredString(value.id, `${field}.id`);
    const name = requiredString(value.name, `${field}.name`).trim();
    if (roomIds.has(id)) {
      throw new RoundPlanError("Room IDs must be unique within a round.", 400);
    }
    if (roomNames.has(name.toLowerCase())) {
      throw new RoundPlanError("Room names must be unique within a round.", 400);
    }
    roomIds.add(id);
    roomNames.add(name.toLowerCase());

    if (!ROOM_DOTS.some((dot) => dot === value.dot)) {
      throw new RoundPlanError(`${field}.dot must be a supported room color.`, 400);
    }
    if (!Array.isArray(value.participantUUIDs)) {
      throw new RoundPlanError(`${field}.participantUUIDs must be an array.`, 400);
    }
    const participantUUIDs = value.participantUUIDs.map((participant: unknown) => {
      const uuid = requiredString(participant, `${field}.participantUUIDs entry`);
      if (assignedParticipants.has(uuid)) {
        throw new RoundPlanError("A participant can be assigned only once per round.", 400);
      }
      assignedParticipants.add(uuid);
      return uuid;
    });

    // Copy only draft fields. Extra inputs such as zoomRoomId/live presence are
    // not saved; fresh arrays also prevent caller mutations bypassing revisions.
    return { id, name, dot: value.dot as RoomDot, participantUUIDs };
  });

  return { parentUUID, roundId, title, rooms };
}

/** GET does not create a default. Undefined means this round has no saved draft yet. */
export function getRoundPlan(parentUUID: unknown, roundId: unknown): RoundPlan | undefined {
  const plan = plans.get(planKey(parentUUID, roundId));
  return plan ? structuredClone(plan) : undefined;
}

/** Save a whole draft; removing a room also removes its nested assignment intent. */
export function saveRoundPlan(input: unknown, expectedRevision: unknown): RoundPlan {
  const draft = validateDraft(input);
  if (
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RoundPlanError("expectedRevision must be a non-negative safe integer below the maximum.", 400);
  }

  const key = planKey(draft.parentUUID, draft.roundId);
  const currentRevision = plans.get(key)?.revision ?? 0;
  if (expectedRevision !== currentRevision) {
    throw new RoundPlanError(
      `The draft changed. Expected revision ${expectedRevision}, but current revision is ${currentRevision}. Reload before saving again.`,
      409,
    );
  }

  // No await between compare/write: two saves cannot interleave in this Node
  // process. A database implementation must perform the same check atomically.
  const saved: RoundPlan = { ...draft, revision: currentRevision + 1 };
  plans.set(key, saved);
  return structuredClone(saved);
}
