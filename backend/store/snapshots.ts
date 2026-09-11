import { type Participant, type Room, type RoomSnapshot } from "../types/breakout.ts";

/** Process-local live snapshot state, separate from every saved round draft. */
interface MeetingRecord {
  roomIdByZoomId: Map<string, string>;
  intendedCreationNames: string[];
  nextRoomNumber: number;
  snapshot: RoomSnapshot;
}

const meetings = new Map<string, MeetingRecord>();

function emptySnapshot(parentUUID: string): RoomSnapshot {
  return {
    parentUUID,
    rooms: [],
    unassigned: [],
    sessionState: "planning",
    capturedAt: new Date().toISOString(),
  };
}

function recordFor(parentUUID: string): MeetingRecord {
  const existing = meetings.get(parentUUID);
  if (existing) return existing;

  const created: MeetingRecord = {
    roomIdByZoomId: new Map(),
    intendedCreationNames: [],
    nextRoomNumber: 1,
    snapshot: emptySnapshot(parentUUID),
  };
  meetings.set(parentUUID, created);
  return created;
}

function mintRoomId(record: MeetingRecord): string {
  const id = `room-${record.nextRoomNumber}`;
  record.nextRoomNumber += 1;
  return id;
}

/** A native rename keeps identity because Zoom's room ID did not change. */
function observedRoomId(record: MeetingRecord, zoomRoomId: string | undefined): string {
  if (!zoomRoomId) return mintRoomId(record);
  const existing = record.roomIdByZoomId.get(zoomRoomId);
  if (existing) return existing;

  const created = mintRoomId(record);
  record.roomIdByZoomId.set(zoomRoomId, created);
  return created;
}

function withRoomId(participant: Participant, roomId: string | null): Participant {
  return { ...participant, roomId };
}

/** Stores one full live read. Names never reconnect externally recreated rooms. */
export function saveSnapshot(incoming: RoomSnapshot): RoomSnapshot {
  const record = recordFor(incoming.parentUUID);
  const currentZoomIds = new Set<string>();

  const rooms: Room[] = incoming.rooms.map((room) => {
    if (room.zoomRoomId) currentZoomIds.add(room.zoomRoomId);
    const id = observedRoomId(record, room.zoomRoomId);
    return {
      ...room,
      id,
      participants: room.participants.map((person) => withRoomId(person, id)),
    };
  });

  // A missing Zoom ID belongs to an old room set and cannot identify future rooms.
  for (const zoomRoomId of record.roomIdByZoomId.keys()) {
    if (!currentZoomIds.has(zoomRoomId)) record.roomIdByZoomId.delete(zoomRoomId);
  }

  const stored: RoomSnapshot = {
    ...incoming,
    rooms,
    unassigned: incoming.unassigned.map((person) => withRoomId(person, null)),
    capturedAt: new Date().toISOString(),
  };
  record.snapshot = stored;
  return structuredClone(stored);
}

export function readSnapshot(parentUUID: string): RoomSnapshot {
  const snapshot = meetings.get(parentUUID)?.snapshot ?? emptySnapshot(parentUUID);
  return structuredClone(snapshot);
}

/** Compatibility for Slice 3 execution; records names without changing live state. */
export function recordIntendedCreationNames(
  parentUUID: string,
  names: string[],
): RoomSnapshot {
  const record = recordFor(parentUUID);
  record.intendedCreationNames = [...names];
  return structuredClone(record.snapshot);
}
