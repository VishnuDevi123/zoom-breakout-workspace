/**
 * Static fixtures for slice 0. Every Week 3 route answers from here so the
 * frontend can be built before any Zoom SDK call exists. Later slices replace
 * these with real state read from the Zoom client.
 */

import {
  ROOM_DOTS,
  type Participant,
  type Room,
  type RoomSnapshot,
  type SessionRecord,
} from "../types/breakout.ts";

export const FIXTURE_PARENT_UUID = "fixture-parent-meeting-uuid";

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

const roomOne: Room = {
  id: "room-1",
  zoomRoomId: "zoom-room-1",
  name: "Room 1",
  dot: ROOM_DOTS[0],
  participants: [
    person(1, "Priya Raman", "room-1", "in-room", true),
    person(2, "Marco Silva", "room-1", "in-room"),
    person(3, "Aisha Noor", "room-1", "in-room"),
  ],
};

const roomTwo: Room = {
  id: "room-2",
  zoomRoomId: "zoom-room-2",
  name: "Room 2",
  dot: ROOM_DOTS[1],
  participants: [
    person(4, "Devon Blake", "room-2", "in-room"),
    person(5, "Hana Sato", "room-2", "in-room"),
  ],
};

const roomThree: Room = {
  id: "room-3",
  zoomRoomId: "zoom-room-3",
  name: "Room 3",
  dot: ROOM_DOTS[2],
  participants: [person(6, "Owen Pryce", "room-3", "in-room")],
};

const unassigned: Participant[] = [
  person(7, "Zara Khan", null, "joining"),
  person(8, "Ben Tobin", null, "not-joined"),
  person(9, "Lin Chen", null, "unassigned"),
];

export function fixtureSnapshot(parentUUID = FIXTURE_PARENT_UUID): RoomSnapshot {
  return {
    parentUUID,
    rooms: [roomOne, roomTwo, roomThree],
    unassigned,
    sessionState: "planning",
    capturedAt: new Date().toISOString(),
  };
}

export function fixtureSession(
  parentUUID = FIXTURE_PARENT_UUID,
  declaredRole: SessionRecord["declaredRole"] = "host",
): SessionRecord {
  const now = new Date().toISOString();

  return {
    parentUUID,
    declaredRole,
    sessionState: "planning",
    createdAt: now,
    updatedAt: now,
  };
}
