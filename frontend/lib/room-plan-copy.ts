import type { RoundPlanDraft } from "@/types/breakout";

/**
 * Seed one round's draft from another. Rooms get new app-owned ids so the two
 * drafts never share a room; Zoom ids are not part of a draft and never copied.
 */
export function copyRooms(
  source: RoundPlanDraft,
  target: { parentUUID: string; roundId: string; title: string },
  options: { withPeople: boolean },
): RoundPlanDraft {
  return {
    parentUUID: target.parentUUID,
    roundId: target.roundId,
    title: target.title,
    rooms: source.rooms.map((room) => ({
      id: crypto.randomUUID(),
      name: room.name,
      dot: room.dot,
      participantUUIDs: options.withPeople ? [...room.participantUUIDs] : [],
    })),
    stayInMainParticipantUUIDs: options.withPeople ? [...source.stayInMainParticipantUUIDs] : [],
  };
}
