"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { readRoomResponses, saveTick } from "@/lib/execution-api";
import type { RoomResponsesView } from "@/types/breakout";

/**
 * What the participant's room has written: notes, ready marks, checklist ticks,
 * their own answers and everyone's answer status.
 *
 * Separate from `use-participant-round`, which reads what the host wrote (task,
 * activities) and refetches on `taskRevision`. This refetches on the room's own
 * counter, `LiveState.roomRevisions[roomId]`, which every response write bumps.
 */
export function useRoomResponses({
  parentUUID,
  roundId,
  roomId,
  participantUUID,
  roomRevision,
}: {
  parentUUID: string;
  roundId: string;
  roomId: string;
  participantUUID: string;
  roomRevision: number;
}) {
  const [view, setView] = useState<RoomResponsesView | null>(null);

  useEffect(() => {
    let alive = true;
    if (!parentUUID || !roundId || !roomId || !participantUUID) return;

    readRoomResponses(parentUUID, roundId, roomId, participantUUID)
      .then((next) => {
        if (alive) setView(next);
      })
      .catch(() => {
        // Keep what is on screen; the next counter bump retries.
      });

    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, roomId, participantUUID, roomRevision]);

  /** Every write returns the caller's fresh view; the room's other members refetch on the counter. */
  const write = useCallback(async (request: Promise<RoomResponsesView>): Promise<boolean> => {
    try {
      setView(await request);
      return true;
    } catch (error) {
      toast.error("Could not save.", {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    }
  }, []);

  const setTick = useCallback(
    (itemId: string, done: boolean) =>
      write(saveTick(roundId, roomId, itemId, { parentUUID, participantUUID, done })),
    [write, parentUUID, roundId, roomId, participantUUID],
  );

  return { view, setTick };
}
