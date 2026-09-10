import type { Participant, Room, RoomSnapshot } from "../types/breakout.ts";

/**
 * In-memory snapshot store, keyed by parent meeting UUID.
 *
 * Its real job is minting stable internal room ids. Zoom re-issues its own
 * breakout room id whenever rooms are recreated, so a rename in slice 4 or an
 * assignment in slice 5 cannot be addressed by Zoom's id and survive. Room name
 * is the one property that persists across a recreate, so names are the key the
 * internal ids are matched on.
 *
 * The store is a process-local Map. It is deliberately not a database: week 3
 * only needs the state to outlive a single request.
 */

interface MeetingRecord {
  /** Internal room id per room name, so the same name keeps its id forever. */
  roomIdByName: Map<string, string>;
  /** Increments per meeting, so ids read as room-1, room-2 in creation order. */
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
    roomIdByName: new Map(),
    nextRoomNumber: 1,
    snapshot: emptySnapshot(parentUUID),
  };

  meetings.set(parentUUID, created);
  return created;
}

/**
 * Returns the id this room name already has, or mints a new one. Names are
 * compared case-insensitively and trimmed, because the host types them and
 * "Table Amber" and "table amber " are the same room to a person.
 */
function stableRoomId(record: MeetingRecord, name: string): string {
  const key = name.trim().toLowerCase();

  const existing = record.roomIdByName.get(key);
  if (existing) return existing;

  const minted = `room-${record.nextRoomNumber}`;

  record.nextRoomNumber += 1;
  record.roomIdByName.set(key, minted);

  return minted;
}

/** Rewrites a participant so its roomId points at the stable id, not the client's guess. */
function withRoomId(participant: Participant, roomId: string | null): Participant {
  return { ...participant, roomId };
}

/**
 * Stores a normalized snapshot and returns it with stable ids applied. The
 * returned value is what the client renders, so the ids on screen are always
 * the ids later slices can address.
 */
export function saveSnapshot(incoming: RoomSnapshot): RoomSnapshot {
  const record = recordFor(incoming.parentUUID);

  const rooms: Room[] = incoming.rooms.map((room) => {
    const id = stableRoomId(record, room.name);

    return {
      ...room,
      id,
      participants: room.participants.map((person) => withRoomId(person, id)),
    };
  });

  const stored: RoomSnapshot = {
    ...incoming,
    rooms,
    unassigned: incoming.unassigned.map((person) => withRoomId(person, null)),
    capturedAt: new Date().toISOString(),
  };

  record.snapshot = stored;

  return stored;
}

/**
 * Last stored snapshot for a meeting. An unknown meeting returns an empty
 * snapshot rather than an error: nothing has been read yet, which is a normal
 * state and not a failure.
 */
export function readSnapshot(parentUUID: string): RoomSnapshot {
  return meetings.get(parentUUID)?.snapshot ?? emptySnapshot(parentUUID);
}
