import { withZoomTimeout } from "@/lib/zoom-call";
import type { ZoomSdk } from "@/lib/zoom-sdk";
import type { RoundPlan } from "@/types/breakout";

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
  const created = await withZoomTimeout(
    "Create breakout rooms",
    sdk.createBreakoutRooms({ numberOfRooms: names.length, assign: "manually", names }),
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
  await withZoomTimeout("Open breakout rooms", sdk.openBreakoutRooms());
}

export async function closeRoundInZoom(sdk: ZoomSdk): Promise<void> {
  await withZoomTimeout("Close breakout rooms", sdk.closeBreakoutRooms());
}
