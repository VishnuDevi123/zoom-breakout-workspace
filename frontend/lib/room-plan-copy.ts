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

/**
 * "Same groups": the plan a round launches with, taken from the round that ran
 * before it. Mid-round placements are already in that plan, so they carry over.
 * People Zoom no longer reports are dropped, because assigning someone who left
 * would fail the launch. `present` is null when presence is unknown; then
 * nobody is dropped.
 */
export function groupsForLaunch(
  source: RoundPlanDraft,
  target: { parentUUID: string; roundId: string; title: string },
  present: Set<string> | null,
): RoundPlanDraft {
  const copied = copyRooms(source, target, { withPeople: true });
  if (!present) return copied;
  return {
    ...copied,
    rooms: copied.rooms.map((room) => ({
      ...room,
      participantUUIDs: room.participantUUIDs.filter((uuid) => present.has(uuid)),
    })),
    stayInMainParticipantUUIDs: copied.stayInMainParticipantUUIDs.filter((uuid) => present.has(uuid)),
  };
}
