"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { recordRawSdkError, recordRawSdkRead } from "@/lib/debug/raw-sdk-read";
import { normalizeRoomSnapshot } from "@/lib/normalize-rooms";
import {
  configureZoomSdk,
  normalizeSdkError,
  type SdkErrorInfo,
  type ZoomSdk,
} from "@/lib/zoom-sdk";
import type { ApiResponse, Participant, RoomSnapshot } from "@/types/breakout";

/**
 * Slice 2 room read.
 *
 * One pass is: read the Zoom client, normalize, store the result on the
 * backend, then render whatever the backend echoes back. The echo matters
 * because the backend is what mints the stable room ids that slices 4 and 5
 * rename and assign against; rendering the local normalization instead would
 * show ids that no later call could match.
 *
 * The read is manual. Live updates arrive in slice 7.
 */

export type RoomSnapshotState =
  | { kind: "loading" }
  | {
      kind: "ready";
      snapshot: RoomSnapshot;
      /**
       * Set when the roster call failed. The rooms are still correct, but the
       * unassigned rail is incomplete, so the UI must say so rather than imply
       * that everybody has a room.
       */
      rosterError: SdkErrorInfo | null;
    }
  | { kind: "error"; error: SdkErrorInfo };

/**
 * Reads the full meeting roster. A refusal here is not fatal: the room cards
 * are still accurate without it, only the unassigned bucket is unknown.
 */
async function readMeetingRoster(sdk: ZoomSdk) {
  try {
    const { participants } = await sdk.getMeetingParticipants();
    return { participants, error: null };
  } catch (error) {
    return {
      participants: [],
      error: normalizeSdkError(error, "GET_MEETING_PARTICIPANTS_FAILED"),
    };
  }
}

/**
 * Stores the snapshot and returns the backend's version of it, which carries
 * the stable room ids. A backend failure falls back to the local snapshot so a
 * host can still see their rooms while the API is down.
 */
async function storeSnapshot(snapshot: RoomSnapshot): Promise<RoomSnapshot> {
  try {
    const response = await fetch("/api/rooms/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const result: ApiResponse<RoomSnapshot> = await response.json();

    return result.success ? result.data : snapshot;
  } catch (error) {
    console.error("Snapshot store failed, showing the local read:", error);
    return snapshot;
  }
}

function participantsFrom(snapshot: RoomSnapshot): Participant[] {
  const observed = [
    ...snapshot.unassigned,
    ...snapshot.rooms.flatMap((room) => room.participants),
  ];
  return [
    ...new Map(
      observed.map((participant) => [participant.participantUUID, participant]),
    ).values(),
  ];
}

export function useRoomSnapshot() {
  const [state, setState] = useState<RoomSnapshotState>({ kind: "loading" });
  const [knownRoster, setKnownRoster] = useState<Participant[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /** Stops a resolved read from writing into an unmounted component. */
  const aliveRef = useRef(true);

  const read = useCallback(async () => {
    const bootstrap = await configureZoomSdk();

    if (bootstrap.kind === "unavailable") {
      if (!aliveRef.current) return;
      setState({ kind: "error", error: bootstrap.error });
      return;
    }

    const { sdk, meetingUUID } = bootstrap;

    try {
      // The calls run one after another rather than through Promise.all. The
      // SDK bridge is a single postMessage channel, and concurrent calls on it
      // have been observed to fail and then keep failing until the meeting is
      // rejoined, so the sequence is kept strictly serial.
      const { rooms } = await sdk.getBreakoutRoomList();
      const self = await sdk.getUserContext();
      const roster = await readMeetingRoster(sdk);

      // Temporary diagnostics. Remove with lib/debug/raw-sdk-read.ts once the
      // SDK payload shapes are settled.
      recordRawSdkRead("getBreakoutRoomList + getMeetingParticipants:", {
        rooms,
        roster: roster.participants,
        rosterError: roster.error,
        self,
      });

      const local = normalizeRoomSnapshot({
        parentUUID: meetingUUID,
        zoomRooms: rooms,
        meetingParticipants: roster.participants,
      });

      const stored = await storeSnapshot(local);

      if (!aliveRef.current) return;
      setKnownRoster((known) => [
        ...new Map(
          [...known, ...participantsFrom(stored)].map((participant) => [
            participant.participantUUID,
            participant,
          ]),
        ).values(),
      ]);
      setState({ kind: "ready", snapshot: stored, rosterError: roster.error });
    } catch (error) {
      // Kept raw as well as normalised, because the SDK sometimes carries
      // detail on the object that no summary field exposes.
      recordRawSdkError("getBreakoutRoomList failed:", error);

      if (!aliveRef.current) return;
      setState({
        kind: "error",
        error: normalizeSdkError(error, "GET_BREAKOUT_ROOM_LIST_FAILED"),
      });
    }
  }, []);

  /** Manual Refresh. Keeps the current cards on screen while the read runs. */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await read();
    if (!aliveRef.current) return;
    setIsRefreshing(false);
  }, [read]);

  useEffect(() => {
    aliveRef.current = true;

    // Deferred by one microtask so the first state write lands after the effect
    // body has returned. Reading the Zoom client is an external subscription,
    // not derived state, so the read itself belongs here.
    void Promise.resolve().then(read);

    return () => {
      aliveRef.current = false;
    };
  }, [read]);

  return { state, refresh, isRefreshing, knownRoster };
}
