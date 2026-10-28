"use client";

import { toast } from "sonner";

import { setRoomStatus } from "@/lib/execution-api";
import type { LiveState, RoomStatus } from "@/types/breakout";

/**
 * The room's status as the host sees it, and one tap to change it. The value
 * comes from the live state, so every person in the room sees the same choice;
 * a tap's new state arrives back over SSE.
 */
export function useRoomStatus({
  live,
  roomId,
  participantUUID,
}: {
  live: LiveState | null;
  roomId: string;
  participantUUID: string;
}): { current: RoomStatus; choose: (status: RoomStatus) => Promise<void> } {
  const round = live?.round ?? null;
  const current: RoomStatus = round?.roomStatus[roomId] ?? "onTrack";

  async function choose(status: RoomStatus) {
    if (!live || !round || status === current) return;
    try {
      await setRoomStatus({ parentUUID: live.parentUUID, roundId: round.roundId, roomId, participantUUID, status });
    } catch (error) {
      toast.error("Could not update the room status.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return { current, choose };
}
