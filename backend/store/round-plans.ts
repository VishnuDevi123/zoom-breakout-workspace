import {
  MAX_ROOMS,
  ROOM_DOTS,
  type PlannedRoom,
  type RoomDot,
  type RoundPlan,
  type RoundPlanDraft,
} from "../types/breakout.ts";
import { changeItem, readItem, roundItem, saveItem } from "../services/dynamo.ts";
import { HttpError, isRecord, requiredString } from "../services/http-error.ts";

// One record per round (item "round#<roundId>#plan"): its rooms and who is in them.

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
    throw new HttpError(`rooms must contain 1 to ${MAX_ROOMS} rooms.`, 400);
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
        throw new HttpError("Room IDs must be unique within a round.", 400);
      }
      if (roomNames.has(name.toLowerCase())) {
        throw new HttpError("Room names must be unique within a round.", 400);
      }
      roomIds.add(id);
      roomNames.add(name.toLowerCase());

      if (!ROOM_DOTS.some((dot) => dot === value.dot)) {
        throw new HttpError(`${field}.dot must be a supported room color.`, 400);
      }
      if (!Array.isArray(value.participantUUIDs)) {
        throw new HttpError(`${field}.participantUUIDs must be an array.`, 400);
      }
      const participantUUIDs = value.participantUUIDs.map(
        (participant: unknown) => {
          const uuid = requiredString(
            participant,
            `${field}.participantUUIDs entry`,
          );
          if (assignedParticipants.has(uuid)) {
            throw new HttpError("A participant can be assigned only once per round.", 400);
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
    throw new HttpError("stayInMainParticipantUUIDs must be an array.", 400);
  }
  const stayInMainParticipants = new Set<string>();
  const stayInMainParticipantUUIDs = stayInMainInput.map(
    (participant: unknown) => {
      const uuid = requiredString(
        participant,
        "stayInMainParticipantUUIDs entry",
      );
      if (assignedParticipants.has(uuid)) {
        throw new HttpError("A participant cannot be assigned to a room and stay in the main meeting.", 400);
      }
      if (stayInMainParticipants.has(uuid)) {
        throw new HttpError("A participant can be marked to stay in the main meeting only once.", 400);
      }
      stayInMainParticipants.add(uuid);
      return uuid;
    },
  );

  return { parentUUID, roundId, title, rooms, stayInMainParticipantUUIDs };
}

/** GET does not create a default. Undefined means this round has no saved draft yet. */
export async function getRoundPlan(parentUUID: string, roundId: string): Promise<RoundPlan | undefined> {
  return readItem<RoundPlan>(parentUUID, roundItem(roundId, "plan"));
}

/** Save a whole draft; removing a room also removes its nested assignment intent. */
export async function saveRoundPlan(input: unknown, expectedRevision: unknown): Promise<RoundPlan> {
  const draft = validateRoundPlan(input);
  return saveItem(draft.parentUUID, roundItem(draft.roundId, "plan"), draft, expectedRevision);
}

/**
 * Puts one person in one room of a saved plan, out of every other room and out of
 * "stay in main". Used to follow a move Zoom already made. False when nothing changed.
 */
export async function moveToPlannedRoom(
  parentUUID: string,
  roundId: string,
  participantUUID: string,
  roomId: string,
): Promise<boolean> {
  let moved = false;
  await changeItem<RoundPlan>(parentUUID, roundItem(roundId, "plan"), (plan) => {
    const target = plan?.rooms.find((room) => room.id === roomId);
    if (!plan || !target || target.participantUUIDs.includes(participantUUID)) return null;
    moved = true;
    for (const room of plan.rooms) {
      room.participantUUIDs = room.id === roomId
        ? [...room.participantUUIDs, participantUUID]
        : room.participantUUIDs.filter((uuid) => uuid !== participantUUID);
    }
    plan.stayInMainParticipantUUIDs = plan.stayInMainParticipantUUIDs.filter((uuid) => uuid !== participantUUID);
    return plan;
  });
  return moved;
}
