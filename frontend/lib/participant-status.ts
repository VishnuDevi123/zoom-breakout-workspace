import type { LiveState, PlannedRoom } from "@/types/breakout";

/** Where a participant is from the draft editor's point of view. */
export type ParticipantStatus = "in-room" | "unassigned" | "left";

/** Roster row the draft editor renders; built from LiveState by the host workspace. */
export interface Participant {
  participantUUID: string;
  /** False when this row has only an observation key and cannot be saved safely. */
  assignmentEligible: boolean;
  displayName: string;
  /** Uppercase initials rendered in the avatar chip. */
  initials: string;
  status: ParticipantStatus;
  /** Internal id of the room the person sits in, or null when unassigned. */
  roomId: string | null;
  isHost: boolean;
}

/** "Ada Lovelace" -> "AL". Falls back to the first character for single words. */
export function initialsFrom(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words.at(-1)![0]];
  return letters.join("").toUpperCase();
}

export const STATUS_LABEL: Record<ParticipantStatus, string> = {
  "in-room": "in room",
  unassigned: "in main",
  left: "left meeting",
};

/** Live Zoom fact shown beside somebody already placed in the round draft. */
export const DRAFT_MEMBER_STATUS_LABEL: Record<ParticipantStatus, string> = {
  "in-room": "planned · in room",
  unassigned: "planned · in main",
  left: "planned · left meeting",
};

/** Avatar backgrounds for room members, by position. */
export const AVATAR_TINTS = ["#eef1ff", "#c3faf5", "#fff4c4", "#fde0f0", "#e3f7d4"];

/**
 * The people a participant shares a breakout room with, from the host's draft.
 * Once Zoom has reported which breakout room this is, only members actually in
 * it are kept. Names come from the webhook-fed live store; the caller is "You".
 */
export function roomMembers({
  room,
  live,
  participantUUID,
}: {
  room: PlannedRoom;
  live: LiveState | null;
  participantUUID: string;
}): { participantUUID: string; name: string }[] {
  const roomUUID = live?.round?.roomUUIDs[room.id] ?? null;
  const known = new Map((live?.participants ?? []).map((p) => [p.participantUUID, p]));
  return room.participantUUIDs
    .filter((uuid) => uuid === participantUUID || !roomUUID || known.get(uuid)?.location === roomUUID)
    .map((uuid) => ({
      participantUUID: uuid,
      name: uuid === participantUUID ? "You" : known.get(uuid)?.name || "Participant",
    }));
}
