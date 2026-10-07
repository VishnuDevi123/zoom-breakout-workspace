import type { RoundPlanDraft } from "@/types/breakout";

export interface ParticipantRoomAssignment {
  participantUUID: string;
  roomId: string;
}

export function assignParticipantToRoom(
  draft: RoundPlanDraft,
  { participantUUID, roomId }: ParticipantRoomAssignment,
): RoundPlanDraft {
  if (!draft.rooms.some((room) => room.id === roomId)) return draft;

  const currentRoom = draft.rooms.find((room) =>
    room.participantUUIDs.includes(participantUUID),
  );
  const isStayingInMain = draft.stayInMainParticipantUUIDs.includes(participantUUID);
  if (currentRoom?.id === roomId && !isStayingInMain) return draft;

  return {
    ...draft,
    rooms: draft.rooms.map((room) => {
      const remainingParticipants = room.participantUUIDs.filter(
        (uuid) => uuid !== participantUUID,
      );
      return room.id === roomId
        ? { ...room, participantUUIDs: [...remainingParticipants, participantUUID] }
        : { ...room, participantUUIDs: remainingParticipants };
    }),
    stayInMainParticipantUUIDs: draft.stayInMainParticipantUUIDs.filter(
      (uuid) => uuid !== participantUUID,
    ),
  };
}

export function clearParticipantPlacement(
  draft: RoundPlanDraft,
  participantUUID: string,
): RoundPlanDraft {
  const isPlaced =
    draft.stayInMainParticipantUUIDs.includes(participantUUID) ||
    draft.rooms.some((room) => room.participantUUIDs.includes(participantUUID));
  if (!isPlaced) return draft;

  return {
    ...draft,
    rooms: draft.rooms.map((room) => ({
      ...room,
      participantUUIDs: room.participantUUIDs.filter(
        (uuid) => uuid !== participantUUID,
      ),
    })),
    stayInMainParticipantUUIDs: draft.stayInMainParticipantUUIDs.filter(
      (uuid) => uuid !== participantUUID,
    ),
  };
}

export function keepParticipantInMain(
  draft: RoundPlanDraft,
  participantUUID: string,
): RoundPlanDraft {
  const isAssigned = draft.rooms.some((room) =>
    room.participantUUIDs.includes(participantUUID),
  );
  const isStayingInMain = draft.stayInMainParticipantUUIDs.includes(participantUUID);
  if (isStayingInMain && !isAssigned) return draft;

  const clearedDraft = clearParticipantPlacement(draft, participantUUID);
  return {
    ...clearedDraft,
    stayInMainParticipantUUIDs: [
      ...clearedDraft.stayInMainParticipantUUIDs,
      participantUUID,
    ],
  };
}

/**
 * Place only people who are not placed yet, each into the smallest room. Nobody
 * already placed moves, which is what the live sheet needs: people in open rooms
 * must stay put. The planner rebalances with `rebalanceEvenly` instead.
 */
export function autoAssignParticipantsEvenly(
  draft: RoundPlanDraft,
  participantUUIDs: string[],
): RoundPlanDraft {
  const alreadyPlaced = new Set([
    ...draft.rooms.flatMap((room) => room.participantUUIDs),
    ...draft.stayInMainParticipantUUIDs,
  ]);
  const eligible = participantUUIDs.filter((participantUUID) => {
    if (alreadyPlaced.has(participantUUID)) return false;
    alreadyPlaced.add(participantUUID);
    return true;
  });
  if (eligible.length === 0) return draft;

  const assignments = draft.rooms.map((room) => [...room.participantUUIDs]);
  for (const participantUUID of eligible) {
    let smallestRoomIndex = 0;
    for (let index = 1; index < assignments.length; index += 1) {
      if (assignments[index].length < assignments[smallestRoomIndex].length) {
        smallestRoomIndex = index;
      }
    }
    assignments[smallestRoomIndex].push(participantUUID);
  }

  return {
    ...draft,
    rooms: draft.rooms.map((room, index) => ({
      ...room,
      participantUUIDs: assignments[index],
    })),
  };
}

/**
 * Spread the given people evenly across the rooms, moving as few as possible.
 * The planner's "Auto-assign evenly" uses this, so a changed room count
 * rebalances rather than only placing newcomers.
 *
 * Room sizes differ by at most one, earlier rooms taking the remainder. Everyone
 * keeps their room while it is not over its size; an over-full room gives up its
 * most recently added people first. People kept in the main room stay there,
 * and planned people missing from the list stay put and do not count.
 */
export function rebalanceEvenly(draft: RoundPlanDraft, participantUUIDs: string[]): RoundPlanDraft {
  if (draft.rooms.length === 0) return draft;
  const keptInMain = new Set(draft.stayInMainParticipantUUIDs);
  const movable = new Set(participantUUIDs.filter((uuid) => !keptInMain.has(uuid)));

  const base = Math.floor(movable.size / draft.rooms.length);
  const remainder = movable.size % draft.rooms.length;
  const sizeFor = (index: number) => base + (index < remainder ? 1 : 0);

  const placed = new Set(draft.rooms.flatMap((room) => room.participantUUIDs));
  const waiting = [...movable].filter((uuid) => !placed.has(uuid));
  const staying = draft.rooms.map((room, index) => {
    const movableHere = room.participantUUIDs.filter((uuid) => movable.has(uuid));
    waiting.push(...movableHere.slice(sizeFor(index)));
    return movableHere.slice(0, sizeFor(index));
  });

  return {
    ...draft,
    rooms: draft.rooms.map((room, index) => {
      const absent = room.participantUUIDs.filter((uuid) => !movable.has(uuid));
      const joining = waiting.splice(0, sizeFor(index) - staying[index].length);
      return { ...room, participantUUIDs: [...absent, ...staying[index], ...joining] };
    }),
  };
}

/** People a later draft puts in a room who were in no room before, with the room they got. */
export function newPlacements(
  before: RoundPlanDraft,
  after: RoundPlanDraft,
): (ParticipantRoomAssignment & { roomName: string })[] {
  const placedBefore = new Set(before.rooms.flatMap((room) => room.participantUUIDs));
  return after.rooms.flatMap((room) =>
    room.participantUUIDs
      .filter((participantUUID) => !placedBefore.has(participantUUID))
      .map((participantUUID) => ({ participantUUID, roomId: room.id, roomName: room.name })),
  );
}
