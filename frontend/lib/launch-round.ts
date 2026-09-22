import { withZoomTimeout } from "@/lib/zoom-call";
import type { ZoomSdk } from "@/lib/zoom-sdk";
import type { RoundPlan } from "@/types/breakout";

/**
 * Zoom is not ready the instant its previous call resolves: the room set stays
 * locked for a moment after a close, and newly created rooms cannot be opened
 * straight away. Both answer with their own message and both clear on their own,
 * so the launch waits rather than failing.
 */
const ZOOM_BUSY_MESSAGES = ["can not edit the breakout room", "not ready"];
const ZOOM_BUSY_WAIT_MS = 1_500;
const ZOOM_BUSY_ATTEMPTS = 4;

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

  // No close countdown: the app owns the round timer, and a countdown leaves Zoom
  // refusing to create the next round's rooms. Moving people needs no consent
  // dialog either way, in or out.
  onStep("Preparing Zoom…");
  await withZoomTimeout(
    "Configure breakout rooms",
    sdk.configureBreakoutRooms({
      closeAfter: 0,
      countDown: 0,
      automaticallyMoveParticipantsIntoRooms: true,
      automaticallyMoveParticipantsIntoMainRoom: true,
    }),
  );

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
