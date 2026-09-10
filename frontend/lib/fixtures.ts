/**
 * Slice 0 fixtures. They mirror `backend/fixtures/breakout.ts` so the shell can
 * be rendered and reviewed before any Zoom SDK read exists. Slice 2 replaces
 * this with a real getBreakoutRoomList() read.
 */

import {
  DEFAULT_ROOM_NAMES,
  ROOM_DOTS,
  type Participant,
  type RoomSnapshot,
} from "@/types/breakout";

function person(
  n: number,
  displayName: string,
  roomId: string | null,
  status: Participant["status"],
  isHost = false,
): Participant {
  return {
    participantUUID: `fixture-participant-${n}`,
    participantId: String(1000 + n),
    displayName,
    initials: displayName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase(),
    status,
    roomId,
    isHost,
  };
}

export const FIXTURE_SNAPSHOT: RoomSnapshot = {
  parentUUID: "fixture-parent-meeting-uuid",
  rooms: [
    {
      id: "room-1",
      zoomRoomId: "zoom-room-1",
      name: DEFAULT_ROOM_NAMES[0],
      dot: ROOM_DOTS[0],
      participants: [
        person(1, "Priya Raman", "room-1", "in-room", true),
        person(2, "Marco Silva", "room-1", "in-room"),
        person(3, "Aisha Noor", "room-1", "in-room"),
      ],
    },
    {
      id: "room-2",
      zoomRoomId: "zoom-room-2",
      name: DEFAULT_ROOM_NAMES[1],
      dot: ROOM_DOTS[1],
      participants: [
        person(4, "Devon Blake", "room-2", "in-room"),
        person(5, "Hana Sato", "room-2", "in-room"),
      ],
    },
    {
      id: "room-3",
      zoomRoomId: "zoom-room-3",
      name: DEFAULT_ROOM_NAMES[2],
      dot: ROOM_DOTS[2],
      participants: [person(6, "Owen Pryce", "room-3", "in-room")],
    },
  ],
  unassigned: [
    person(7, "Zara Khan", null, "joining"),
    person(8, "Ben Tobin", null, "not-joined"),
    person(9, "Lin Chen", null, "unassigned"),
  ],
  sessionState: "planning",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

/** Label shown at the right edge of an unassigned rail row. */

