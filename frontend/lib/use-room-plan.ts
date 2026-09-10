"use client";

import { useCallback, useState } from "react";

import { recordRawSdkError, recordRawSdkRead } from "@/lib/debug/raw-sdk-read";
import { configureZoomSdk, normalizeSdkError, type SdkErrorInfo } from "@/lib/zoom-sdk";
import type { ApiResponse, RoomSnapshot } from "@/types/breakout";

/**
 * Slice 3 room plan.
 *
 * The plan is one number: how many rooms the host wants. It is held apart from
 * the snapshot in `use-room-snapshot.ts`, which reports how many rooms Zoom
 * actually has. The difference between the two is what makes the Create button
 * meaningful, so the two counts must never be merged into one value.
 *
 * Creating is destructive. Zoom has no call that adds a set of rooms alongside
 * the existing ones, so createBreakoutRooms() deletes every current room first.
 */

/** Zoom's own ceiling for createBreakoutRooms(). Exceeding it fails with code 10095. */
const MAX_ROOMS = 50;

/** Zoom rejects a create of zero rooms, so one is the smallest plan. */
const MIN_ROOMS = 1;

/**
 * Names the rooms the way Zoom's own breakout panel does. The app deliberately
 * carries no theme of its own here: a host who opens Zoom's panel must see the
 * same names they see in this app.
 */
function roomNamesFor(count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => `Room ${index + 1}`);
}

/**
 * Records the intended names against the backend's stable ids, so a later
 * recreate can restore the same naming.
 */
async function storeIntendedNames(parentUUID: string, names: string[]): Promise<void> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentUUID, names }),
  });

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }

  const result: ApiResponse<RoomSnapshot> = await response.json();

  if (!result.success) {
    throw new Error(result.error);
  }
}

export interface RoomPlan {
  /** How many rooms the host is asking for. */
  count: number;
  increase: () => void;
  decrease: () => void;
  canIncrease: boolean;
  canDecrease: boolean;
  /**
   * True when the planned count differs from what Zoom has. This is the only
   * state in which creating does something, and it is what turns the Create
   * button solid.
   */
  hasChanges: boolean;
  /**
   * Creates the rooms in Zoom. Resolves true when Zoom accepted the call, so
   * the caller knows whether re-reading the client is worth doing.
   */
  create: () => Promise<boolean>;
  isCreating: boolean;
  /** Set when the last create attempt failed. Cleared when the next one starts. */
  error: SdkErrorInfo | null;
}

/**
 * @param roomCount Rooms Zoom currently reports. The stepper starts here and
 * returns here whenever the snapshot changes, so the control always opens
 * showing the truth rather than a stale intention.
 */
export function useRoomPlan(roomCount: number): RoomPlan {
  const [count, setCount] = useState(() => Math.max(roomCount, MIN_ROOMS));
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<SdkErrorInfo | null>(null);

  // Adjusting state during render, rather than in an effect, is React's own
  // pattern for a value derived from a prop that must still be editable. It
  // re-runs this component immediately and never paints the stale count.
  const [lastRoomCount, setLastRoomCount] = useState(roomCount);

  if (lastRoomCount !== roomCount) {
    setLastRoomCount(roomCount);
    setCount(Math.max(roomCount, MIN_ROOMS));
  }

  const increase = useCallback(() => {
    setCount((previous) => Math.min(previous + 1, MAX_ROOMS));
  }, []);

  const decrease = useCallback(() => {
    setCount((previous) => Math.max(previous - 1, MIN_ROOMS));
  }, []);

  const create = useCallback(async (): Promise<boolean> => {
    const bootstrap = await configureZoomSdk();

    if (bootstrap.kind === "unavailable") {
      setError(bootstrap.error);
      return false;
    }

    const { sdk, meetingUUID } = bootstrap;
    const names = roomNamesFor(count);

    setIsCreating(true);
    setError(null);

    try {
      // numberOfRooms and names must agree in length, or Zoom answers 10122.
      const created = await sdk.createBreakoutRooms({
        numberOfRooms: names.length,
        assign: "manually",
        names,
      });

      // Temporary diagnostics. Remove with lib/debug/raw-sdk-read.ts once the
      // SDK payload shapes are settled.
      recordRawSdkRead("createBreakoutRooms:", created);

      // The store call runs after Zoom has accepted, so the backend never holds
      // names for rooms that were never created. Its failure is reported but
      // not raised: the rooms exist regardless, and turning a store outage into
      // a create error would tell the host the opposite of what happened.
      try {
        await storeIntendedNames(meetingUUID, names);
      } catch (storeFailure) {
        console.error("Storing the intended room names failed:", storeFailure);
      }

      return true;
    } catch (caught) {
      recordRawSdkError("createBreakoutRooms failed:", caught);
      setError(normalizeSdkError(caught, "CREATE_BREAKOUT_ROOMS_FAILED"));
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [count]);

  return {
    count,
    increase,
    decrease,
    canIncrease: count < MAX_ROOMS,
    canDecrease: count > MIN_ROOMS,
    hasChanges: count !== roomCount,
    create,
    isCreating,
    error,
  };
}
