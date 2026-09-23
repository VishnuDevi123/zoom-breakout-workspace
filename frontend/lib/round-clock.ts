"use client";

import { useEffect, useState } from "react";

/** mm:ss, never negative. */
export function formatClock(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * Seconds left on the round, recomputed every second from the server's endsAt.
 * Null when endsAt is 0, which means the round runs until the host closes it.
 * Shared by the host's live view and the participant screen.
 */
export function useRemainingSec(endsAt: number): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : null;
}
