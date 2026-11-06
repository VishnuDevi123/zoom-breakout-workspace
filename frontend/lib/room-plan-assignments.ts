import type { RoundPlanDraft } from "@/types/breakout";

interface ParticipantRoomAssignment {
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
 * must stay put. The planner's Assign evenly deals afresh with `shuffleEvenly` instead.
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
 * Assign evenly: deal the given people into the rooms in a random order, sizes
 * differing by at most one. Every press is a fresh mix, so each round of "New
 * groups" comes out different. People kept in main stay there, and planned
 * people missing from the list stay put.
 */
export function shuffleEvenly(
  draft: RoundPlanDraft,
  participantUUIDs: string[],
  random: () => number = Math.random,
): RoundPlanDraft {
  if (draft.rooms.length === 0) return draft;
  const keptInMain = new Set(draft.stayInMainParticipantUUIDs);
  const movable = [...new Set(participantUUIDs)].filter((uuid) => !keptInMain.has(uuid));
  // Fisher-Yates, so every order is equally likely.
  for (let index = movable.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [movable[index], movable[swap]] = [movable[swap], movable[index]];
  }
  const movableSet = new Set(movable);

  return {
    ...draft,
    rooms: draft.rooms.map((room, roomIndex) => ({
      ...room,
      participantUUIDs: [
        ...room.participantUUIDs.filter((uuid) => !movableSet.has(uuid)),
        ...movable.filter((_, at) => at % draft.rooms.length === roomIndex),
      ],
    })),
  };
}

/**
 * "New groups" at launch: keep the host's groups for people still here, drop
 * people who left, and put latecomers into the smallest rooms. A round nobody
 * was placed in gets a fresh random deal of everyone present.
 */
export function settleForLaunch(draft: RoundPlanDraft, presentUUIDs: string[]): RoundPlanDraft {
  const present = new Set(presentUUIDs);
  const kept: RoundPlanDraft = {
    ...draft,
    rooms: draft.rooms.map((room) => ({
      ...room,
      participantUUIDs: room.participantUUIDs.filter((uuid) => present.has(uuid)),
    })),
    stayInMainParticipantUUIDs: draft.stayInMainParticipantUUIDs.filter((uuid) => present.has(uuid)),
  };
  const anyPlaced = kept.rooms.some((room) => room.participantUUIDs.length > 0);
  return anyPlaced ? autoAssignParticipantsEvenly(kept, presentUUIDs) : shuffleEvenly(kept, presentUUIDs);
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
