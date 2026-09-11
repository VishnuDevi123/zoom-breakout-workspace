import { participantStatusFromSdk } from "@/lib/participant-status";
import { ROOM_DOTS, type Participant, type Room, type RoomSnapshot } from "@/types/breakout";

/**
 * Turns a Zoom SDK read into the app's own snapshot shape.
 *
 * The two shapes differ in more than field names. The SDK reports room
 * membership only, so it can say who is in a room but never who is waiting
 * outside one. The unassigned bucket is therefore derived here, by subtracting
 * everybody the room list accounts for from the full meeting roster.
 *
 * Room membership is also not consistently named across SDK versions, and can
 * arrive as bare UUID strings. Every field is read defensively and the meeting
 * roster is used as the fallback source of display names.
 */

/** "Ada Lovelace" -> "AL". Falls back to the first character for single words. */
export function initialsFrom(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "?";

  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words.at(-1)![0]];

  return letters.join("").toUpperCase();
}

/** Room colour by position, wrapping once a meeting has more rooms than dots. */
function dotForIndex(index: number) {
  return ROOM_DOTS[index % ROOM_DOTS.length];
}

/** A member may arrive as an object or as a bare participantUUID string. */
function memberUUID(member: ZoomBreakoutMember | string): string | null {
  if (typeof member === "string") return member;
  return member.participantUUID ?? null;
}

/**
 * Zoom reports participantId as a number in the breakout list and as a string
 * on the meeting roster. It is stored as a string so the two agree.
 */
function idAsString(participantId: string | number | undefined): string | undefined {
  return participantId === undefined ? undefined : String(participantId);
}

/**
 * Finds the person's name across the field names different SDK builds use,
 * then falls back to the meeting roster, which always carries screenName.
 */
function memberName(
  member: ZoomBreakoutMember | string,
  rosterNames: Map<string, string>,
): string {
  const uuid = memberUUID(member);
  const fromRoster = uuid ? rosterNames.get(uuid) : undefined;

  if (typeof member === "string") return fromRoster ?? "Unknown";

  return member.displayName ?? member.screenName ?? member.name ?? fromRoster ?? "Unknown";
}

interface NormalizeInput {
  parentUUID: string;
  /** Rooms exactly as getBreakoutRoomList() returned them. */
  zoomRooms: ZoomBreakoutRoom[];
  /**
   * Full meeting roster from getMeetingParticipants(). Empty when the client
   * refused the call, in which case the unassigned bucket is empty too rather
   * than wrong.
   */
  meetingParticipants: ZoomMeetingParticipant[];
}

export function normalizeRoomSnapshot({
  parentUUID,
  zoomRooms,
  meetingParticipants,
}: NormalizeInput): RoomSnapshot {
  const rosterNames = new Map(
    meetingParticipants
      .filter((person) => person.participantUUID)
      .map((person) => [person.participantUUID, person.screenName ?? "Unknown"] as const),
  );

  // The roster is the only call that reports each person's role, so it decides
  // who is marked as host. The breakout list carries no role at all.
  const hostUUIDs = new Set(
    meetingParticipants
      .filter((person) => person.role === "host" || person.role === "coHost")
      .map((person) => person.participantUUID),
  );

  const placedUUIDs = new Set<string>();

  const rooms: Room[] = zoomRooms.map((zoomRoom, index) => {
    // Provisional only. Backend replaces it with identity scoped to Zoom's ID.
    const id = `room-${index + 1}`;

    const participants = (zoomRoom.participants ?? []).map((member, memberIndex) => {
      const uuid = memberUUID(member);
      const displayName = memberName(member, rosterNames);

      if (uuid) placedUUIDs.add(uuid);

      return {
        // A member with no id at all still needs a stable React key, so the
        // room id and position stand in for one.
        participantUUID: uuid ?? `${id}-member-${memberIndex}`,
        participantId:
          typeof member === "string" ? undefined : idAsString(member.participantId),
        displayName,
        initials: initialsFrom(displayName),
        status: participantStatusFromSdk(
          typeof member === "string" ? undefined : member.participantStatus,
        ),
        roomId: id,
        isHost: uuid !== null && hostUUIDs.has(uuid),
      } satisfies Participant;
    });

    return {
      id,
      zoomRoomId: zoomRoom.breakoutRoomId,
      name: zoomRoom.name,
      dot: dotForIndex(index),
      participants,
    };
  });

  const unassigned: Participant[] = meetingParticipants
    .filter((person) => !placedUUIDs.has(person.participantUUID))
    .map((person) => {
      const displayName = person.screenName ?? "Unknown";

      return {
        participantUUID: person.participantUUID,
        participantId: idAsString(person.participantId),
        displayName,
        initials: initialsFrom(displayName),
        status: "unassigned",
        roomId: null,
        isHost: hostUUIDs.has(person.participantUUID),
      } satisfies Participant;
    });

  return {
    parentUUID,
    rooms,
    unassigned,
    sessionState: "planning",
    capturedAt: new Date().toISOString(),
  };
}
