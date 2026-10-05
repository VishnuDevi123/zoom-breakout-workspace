"use client";

import { useEffect, useState } from "react";

import { readRoomResultsForHost } from "@/lib/execution-api";
import type { RoomResponsesHostView } from "@/types/breakout";

/**
 * The host's read-only view of one room's work. `use-room-responses` is the
 * participant's side, with writes and only their own answers; this reads every
 * submitted answer and refetches on the same room counter.
 */
export function useRoomResults({
  parentUUID,
  roundId,
  roomId,
  roomRevision,
}: {
  parentUUID: string;
  roundId: string;
  /** Empty when no room is open, which reads nothing. */
  roomId: string;
  roomRevision: number;
}): RoomResponsesHostView | null {
  const [results, setResults] = useState<RoomResponsesHostView | null>(null);

  useEffect(() => {
    let alive = true;
    if (!parentUUID || !roundId || !roomId) return;

    readRoomResultsForHost(parentUUID, roundId, roomId)
      .then((next) => {
        if (alive) setResults(next);
      })
      .catch(() => {
        // Keep what is on screen; the next counter bump retries.
      });

    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, roomId, roomRevision]);

  // Results read for another room must not show while this one loads.
  return results?.roomId === roomId && results.roundId === roundId ? results : null;
}
