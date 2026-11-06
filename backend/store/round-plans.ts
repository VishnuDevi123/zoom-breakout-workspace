import {
  MAX_ROOMS,
  ROOM_DOTS,
  type PlannedRoom,
  type RoomDot,
  type RoundPlan,
  type RoundPlanDraft,
} from "../types/breakout.ts";
import { HttpError, isRecord, requiredString } from "../services/http-error.ts";

//storage survives browser reloads, but not a backend restart.
const plans = new Map<string, RoundPlan>();


function planKey(parentUUID: unknown, roundId: unknown): string {
  // A tuple avoids delimiter collisions: ["a:b", "c"] differs from ["a", "b:c"].
  return JSON.stringify([
    requiredString(parentUUID, "parentUUID"),
    requiredString(roundId, "roundId"),
  ]);
}

/** Checks and copies a draft without saving it. Replace calls it before it deletes anything. */
export function validateRoundPlan(input: unknown): RoundPlanDraft {
  if (!isRecord(input)) {
    throw new HttpError("The round plan must be an object.", 400);
  }

  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const roundId = requiredString(input.roundId, "roundId");
  const title = requiredString(input.title, "title").trim();
  if (
    !Array.isArray(input.rooms) ||
    input.rooms.length < 1 ||
    input.rooms.length > MAX_ROOMS
  ) {
    throw new HttpError(
      `rooms must contain 1 to ${MAX_ROOMS} rooms.`,
      400,
    );
  }

  const roomIds = new Set<string>();
  const roomNames = new Set<string>();
  const assignedParticipants = new Set<string>();
  const rooms: PlannedRoom[] = input.rooms.map(
    (value: unknown, index: number) => {
      const field = `rooms[${index}]`;
      if (!isRecord(value)) {
        throw new HttpError(`${field} must be an object.`, 400);
      }

      const id = requiredString(value.id, `${field}.id`);
      const name = requiredString(value.name, `${field}.name`).trim();
      if (roomIds.has(id)) {
        throw new HttpError(
          "Room IDs must be unique within a round.",
          400,
        );
      }
      if (roomNames.has(name.toLowerCase())) {
        throw new HttpError(
          "Room names must be unique within a round.",
          400,
        );
      }
      roomIds.add(id);
      roomNames.add(name.toLowerCase());

      if (!ROOM_DOTS.some((dot) => dot === value.dot)) {
        throw new HttpError(
          `${field}.dot must be a supported room color.`,
          400,
        );
      }
      if (!Array.isArray(value.participantUUIDs)) {
        throw new HttpError(
          `${field}.participantUUIDs must be an array.`,
          400,
        );
      }
      const participantUUIDs = value.participantUUIDs.map(
        (participant: unknown) => {
          const uuid = requiredString(
            participant,
            `${field}.participantUUIDs entry`,
          );
          if (assignedParticipants.has(uuid)) {
            throw new HttpError(
              "A participant can be assigned only once per round.",
              400,
            );
          }
          assignedParticipants.add(uuid);
          return uuid;
        },
      );

      // Copy only draft fields. Extra inputs such as zoomRoomId/live presence are
      // not saved; fresh arrays also prevent caller mutations bypassing revisions.
      return { id, name, dot: value.dot as RoomDot, participantUUIDs };
    },
  );

  // Accept an omitted list while older Slice 4 clients finish migrating. New
  // saves always return the explicit field, so the stored shape converges.
  const stayInMainInput = input.stayInMainParticipantUUIDs ?? [];
  if (!Array.isArray(stayInMainInput)) {
    throw new HttpError(
      "stayInMainParticipantUUIDs must be an array.",
      400,
    );
  }
  const stayInMainParticipants = new Set<string>();
  const stayInMainParticipantUUIDs = stayInMainInput.map(
    (participant: unknown) => {
      const uuid = requiredString(
        participant,
        "stayInMainParticipantUUIDs entry",
      );
      if (assignedParticipants.has(uuid)) {
        throw new HttpError(
          "A participant cannot be assigned to a room and stay in the main meeting.",
          400,
        );
      }
      if (stayInMainParticipants.has(uuid)) {
        throw new HttpError(
          "A participant can be marked to stay in the main meeting only once.",
          400,
        );
      }
      stayInMainParticipants.add(uuid);
      return uuid;
    },
  );

  return { parentUUID, roundId, title, rooms, stayInMainParticipantUUIDs };
}

/** GET does not create a default. Undefined means this round has no saved draft yet. */
export function getRoundPlan(
  parentUUID: unknown,
  roundId: unknown,
): RoundPlan | undefined {
  const plan = plans.get(planKey(parentUUID, roundId));
  return plan ? structuredClone(plan) : undefined;
}

/** Save a whole draft; removing a room also removes its nested assignment intent. */
export function saveRoundPlan(
  input: unknown,
  expectedRevision: unknown,
): RoundPlan {
  const draft = validateRoundPlan(input);
  if (
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new HttpError(
      "expectedRevision must be a non-negative safe integer below the maximum.",
      400,
    );
  }

  const key = planKey(draft.parentUUID, draft.roundId);
  const currentRevision = plans.get(key)?.revision ?? 0;
  if (expectedRevision !== currentRevision) {
    throw new HttpError(
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

export function deleteRoundPlan(parentUUID: string, roundId: string) {
  plans.delete(planKey(parentUUID, roundId));
}

/**
 * Puts one person in one room of a saved plan, out of every other room and out of
 * "stay in main". Used to follow a move Zoom already made. False when nothing changed.
 */
export function moveToPlannedRoom(
  parentUUID: string,
  roundId: string,
  participantUUID: string,
  roomId: string,
): boolean {
  const plan = getRoundPlan(parentUUID, roundId);
  const target = plan?.rooms.find((room) => room.id === roomId);
  if (!plan || !target || target.participantUUIDs.includes(participantUUID)) return false;

  const rooms = plan.rooms.map((room) => ({
    ...room,
    participantUUIDs:
      room.id === roomId
        ? [...room.participantUUIDs, participantUUID]
        : room.participantUUIDs.filter((uuid) => uuid !== participantUUID),
  }));
  const stayInMainParticipantUUIDs = plan.stayInMainParticipantUUIDs.filter((uuid) => uuid !== participantUUID);
  saveRoundPlan({ ...plan, rooms, stayInMainParticipantUUIDs }, plan.revision);
  return true;
}
