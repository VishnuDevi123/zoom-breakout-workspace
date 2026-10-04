import { withZoomTimeout } from "@/lib/zoom-call";
import type { ZoomSdk } from "@/lib/zoom-sdk";
import type { RosterEntry, RoundPlan, RoundPlanDraft } from "@/types/breakout";

/**
 * Zoom is not ready the instant its previous call resolves: the room set stays
 * locked for a moment after a close, and newly created rooms cannot be opened
 * straight away. Both answer with their own message and both clear on their own,
 * so the launch waits rather than failing.
 */
const ZOOM_BUSY_MESSAGES = ["can not edit the breakout room", "not ready"];
const ZOOM_BUSY_WAIT_MS = 1_500;
const ZOOM_BUSY_ATTEMPTS = 3;

// function too throw error message
function zoomIsBusy(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return ZOOM_BUSY_MESSAGES.some((busy) => message.includes(busy));
}

/** Run one SDK call, waiting out the short window where Zoom answers "busy". */
async function whenZoomIsReady<T>(
  label: string,
  call: () => Promise<T>,
  onStep: (step: string) => void,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withZoomTimeout(label, call());
    } catch (error: unknown) {
      if (!zoomIsBusy(error) || attempt >= ZOOM_BUSY_ATTEMPTS) throw error;
      onStep("Waiting for Zoom to catch up…");
      await new Promise((resolve) => setTimeout(resolve, ZOOM_BUSY_WAIT_MS));
    }
  }
}

/**
 * Push one saved round into Zoom: create rooms, assign planned people, open.
 * Backend is told afterwards by the caller; webhooks report who actually moved.
 */
export async function launchRoundInZoom(
  sdk: ZoomSdk,
  plan: RoundPlan,
  hostUUID: string,
  onStep: (step: string) => void,
): Promise<void> {
  if (plan.rooms.length === 0) throw new Error("Add at least one room before launching.");

  onStep("Creating rooms…");
  const names = plan.rooms.map((room) => room.name);
  const created = await whenZoomIsReady(
    "Create breakout rooms",
    () => sdk.createBreakoutRooms({ numberOfRooms: names.length, assign: "manually", names }),
    onStep,
  );

  // Zoom returns rooms with its own IDs; names are index-aligned with the request.
  const zoomIdByName = new Map(created.rooms.map((room) => [room.name, room.breakoutRoomId]));

  onStep("Assigning people…");
  for (const room of plan.rooms) {
    const uuid = zoomIdByName.get(room.name);
    if (!uuid) throw new Error(`Zoom did not return a room named "${room.name}".`);
    for (const participantUUID of room.participantUUIDs) {
      // Zoom refuses to assign the host; the host joins rooms on their own.
      if (participantUUID === hostUUID) continue;
      await withZoomTimeout(
        `Assign to ${room.name}`,
        sdk.assignParticipantToBreakoutRoom({ participantUUID, uuid }),
      );
    }
  }

  // Configure only works on a room set that already exists, so it cannot run
  // before the create above: an empty meeting answers "No Breakout Room exist".
  // No close countdown either: the app owns the round timer, and a countdown
  // leaves Zoom refusing to create the next round's rooms.
  onStep("Setting round options…");
  await whenZoomIsReady(
    "Configure breakout rooms",
    () =>
      sdk.configureBreakoutRooms({
        closeAfter: 0,
        countDown: 0,
        automaticallyMoveParticipantsIntoRooms: true,
        automaticallyMoveParticipantsIntoMainRoom: true,
      }),
    onStep,
  );

  onStep("Opening rooms…");
  await whenZoomIsReady("Open breakout rooms", () => sdk.openBreakoutRooms(), onStep);
}

/** Closing rooms Zoom has already closed is not an error: the round ends either way. */
export async function closeRoundInZoom(sdk: ZoomSdk): Promise<void> {
  const { state } = await withZoomTimeout("Read breakout rooms", sdk.getBreakoutRoomList());
  if (state === "closed") return;
  await withZoomTimeout("Close breakout rooms", sdk.closeBreakoutRooms());
}

/** Whether Zoom currently has rooms open, used to clear a round it closed on its own. */
export async function breakoutRoomsAreOpen(sdk: ZoomSdk): Promise<boolean> {
  const { state } = await withZoomTimeout("Read breakout rooms", sdk.getBreakoutRoomList());
  return state === "open";
}

/**
 * Move people still in the main room into rooms that are already open. Zoom wants
 * its own room ids, which launch does not keep, so the room list is read once and
 * matched by name, exactly as at launch. Zoom sends each person an invitation.
 */
export async function assignToOpenRooms(
  sdk: ZoomSdk,
  placements: { participantUUID: string; roomName: string }[],
): Promise<void> {
  const { rooms, state } = await withZoomTimeout("Read breakout rooms", sdk.getBreakoutRoomList());
  if (state !== "open") throw new Error("Zoom has no breakout rooms open.");
  const zoomIdByName = new Map(rooms.map((room) => [room.name, room.breakoutRoomId]));
  for (const { participantUUID, roomName } of placements) {
    const uuid = zoomIdByName.get(roomName);
    if (!uuid) throw new Error(`Zoom has no open room named "${roomName}".`);
    await withZoomTimeout(`Assign to ${roomName}`, sdk.assignParticipantToBreakoutRoom({ participantUUID, uuid }));
  }
}

/**
 * Everyone Zoom reports in the meeting, or null when this caller cannot see them all.
 * With rooms open only the room list covers every room, and only the meeting
 * owner receives its people; a co-host gets empty rooms, which is not an empty meeting.
 */
export async function readMeetingRoster(
  sdk: ZoomSdk,
  plan: RoundPlanDraft,
  hostUUID: string,
): Promise<RosterEntry[] | null> {
  const rooms = await withZoomTimeout("Read breakout rooms", sdk.getBreakoutRoomList());
  if (rooms.state === "closed") {
    const { participants } = await withZoomTimeout("Read participants", sdk.getMeetingParticipants());
    return participants.map((person) => ({
      participantUUID: person.participantUUID,
      name: person.screenName,
      isHost: person.role === "host",
      roomId: null,
    }));
  }
  if (!rooms.unassigned) return null;

  // Rooms were created with the plan's names, so names map back to planned room ids.
  const roomIdByName = new Map(plan.rooms.map((room) => [room.name, room.id]));
  const inRooms = rooms.rooms.flatMap((room) =>
    (room.participants ?? []).map((person) => ({
      participantUUID: person.participantUUID,
      name: person.displayName,
      isHost: person.participantUUID === hostUUID,
      // Assigned but not yet entered still means the main room.
      roomId: person.participantStatus === "joined" ? (roomIdByName.get(room.name) ?? null) : null,
    })),
  );
  const inMain = rooms.unassigned.map((person) => ({
    participantUUID: person.participantUUID,
    name: person.displayName,
    isHost: person.participantUUID === hostUUID,
    roomId: null,
  }));
  return [...inRooms, ...inMain];
}
