"use client";

import { useEffect, useState } from "react";

import { readSavedRoundPlan } from "@/lib/execution-api";
import type { RoundPlan } from "@/types/breakout";

/**
 * Every round's saved draft, read once for the overview's review rail.
 * `use-room-plan` owns one round and tracks edits; this is a read-only sweep of
 * all of them, so the rail can count rooms and spot rounds nobody configured.
 * A round with no saved draft maps to null (the backend answers 404).
 *
 * `refreshKey` refetches when it changes: drafts are edited on another screen,
 * so the map goes stale the moment the host leaves the editor.
 */
export function useRoundSummaries(parentUUID: string, roundIds: string[], refreshKey: unknown) {
  const [plans, setPlans] = useState<Record<string, RoundPlan | null>>({});
  const key = roundIds.join(",");

  useEffect(() => {
    let alive = true;

    async function load() {
      const ids = key.split(",").filter(Boolean);
      const entries = await Promise.all(
        ids.map(async (roundId) => {
          try {
            return [roundId, await readSavedRoundPlan(parentUUID, roundId)] as const;
          } catch {
            return [roundId, null] as const;
          }
        }),
      );
      if (alive) setPlans(Object.fromEntries(entries));
    }

    void load();
    return () => {
      alive = false;
    };
  }, [parentUUID, key, refreshKey]);

  return plans;
}
