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
