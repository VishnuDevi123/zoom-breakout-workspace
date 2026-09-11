import type { ParticipantStatus } from "@/types/breakout";

/**
 * Zoom's breakout status vocabulary, translated into the app's own.
 *
 * The distinction that matters is "assigned" against "in-room". Zoom keeps a
 * room assignment after the rooms close, so the room list still reports a
 * person under a room once they are back in the main meeting. Treating that as
 * presence is what made members look stuck in a card they had left.
 */
export function participantStatusFromSdk(
  sdkStatus: ZoomBreakoutParticipantStatus | undefined,
): ParticipantStatus {
  switch (sdkStatus) {
    case "joined":
    case "in_room":
    case "in-room":
      return "in-room";
    case "joining":
      return "joining";
    case "not_joined":
    case "not-joined":
      return "not-joined";
    case "assigned":
      return "assigned";
    default:
      // Anything unrecognised still came back inside a room, so the weakest
      // true statement is that the person is allotted to it.
      return "assigned";
  }
}


export const STATUS_LABEL: Record<ParticipantStatus, string> = {
  "in-room": "in room",
  assigned: "assigned",
  unassigned: "unassigned",
  joining: "joining",
  "not-joined": "not joined",
};

/** Live Zoom fact shown beside somebody already placed in the round draft. */
export const DRAFT_MEMBER_STATUS_LABEL: Record<ParticipantStatus, string> = {
  "in-room": "planned · in room",
  assigned: "planned · Zoom assigned",
  unassigned: "planned · in main",
  joining: "planned · joining",
  "not-joined": "planned · not joined",
};
