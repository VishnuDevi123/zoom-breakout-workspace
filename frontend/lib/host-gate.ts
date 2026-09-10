"use client";

import { useEffect, useRef, useState } from "react";

import {
  configureZoomSdk,
  normalizeSdkError,
  type SdkErrorInfo,
  type ZoomSdk,
} from "@/lib/zoom-sdk";
import type {
  ApiResponse,
  HostState,
  SessionRecord,
  SessionState,
  ZoomRole,
} from "@/types/breakout";

/**
 * Slice 1 host gate.
 *
 * The hook answers two questions that look like one question but are not:
 *
 *   1. What is this user allowed to do?   -> getUserContext().role
 *   2. Can this client drive breakouts?   -> getBreakoutRoomList() probe
 *
 * A host on an old desktop build, or on an account where the admin disabled
 * breakout rooms, passes question 1 and fails question 2. The gate keeps the
 * two answers apart so that person sees a named error instead of a workspace
 * whose buttons quietly do nothing.
 *
 * The SDK bootstrap itself lives in `lib/zoom-sdk.ts`, because slice 2 onwards
 * needs the configured SDK too and `config()` may only run once per page.
 */

interface ApplyRoleInput {
  sdk: ZoomSdk;
  role: ZoomRole;
  /** Display name from the SDK. Empty when a change event omits it. */
  screenName: string;
}

export interface HostGateValue {
  state: HostState;
  /** Raw SDK role. Null until getUserContext() resolves. */
  role: ZoomRole | null;
  screenName: string;
  meetingUUID: string;
  /** Session lifecycle as the backend reports it. Null before the first POST returns. */
  sessionState: SessionState | null;
  /** Populated only in the "unsupported" state. */
  sdkError: SdkErrorInfo | null;
}

const INITIAL: HostGateValue = {
  state: "checking",
  role: null,
  screenName: "",
  meetingUUID: "",
  sessionState: null,
  sdkError: null,
};

/** Host and co-host are treated identically. Everyone else gets the participant screen. */
export function canManageRooms(role: ZoomRole | null): boolean {
  return role === "host" || role === "coHost";
}

/**
 * Tells the backend which meeting this is and which role the client claims.
 * The role is a claim only: the backend stores it and must never let it
 * authorize a destructive action in a later slice.
 */
async function postSession(
  parentUUID: string,
  declaredRole: ZoomRole,
): Promise<SessionState | null> {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentUUID, declaredRole }),
  });

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }

  const result: ApiResponse<SessionRecord> = await response.json();

  return result.success ? result.data.sessionState : null;
}

export function useHostGate(): HostGateValue {
  const [value, setValue] = useState<HostGateValue>(INITIAL);

  /**
   * Guards every setState that happens after an await. Strict mode mounts the
   * effect twice in development, and a role change can resolve after unmount,
   * so a stale async continuation must not write into a dead component.
   */
  const aliveRef = useRef(true);

  /**
   * Remembers the meeting UUID for callbacks that fire long after init, such as
   * a promotion to co-host twenty minutes into the meeting.
   */
  const meetingUUIDRef = useRef("");

  useEffect(() => {
    aliveRef.current = true;

    /**
     * Runs the support probe. This is deliberately a separate call from the
     * role read: it answers whether the client can drive breakouts at all.
     * Returns null on success, or the error to display on failure.
     */
    async function probeBreakoutSupport(sdk: ZoomSdk): Promise<SdkErrorInfo | null> {
      try {
        await sdk.getBreakoutRoomList();
        return null;
      } catch (error) {
        return normalizeSdkError(error, "GET_BREAKOUT_ROOM_LIST_FAILED");
      }
    }

    /**
     * Turns a role into a screen. The probe only gates the host path, because
     * an attendee is not expected to be able to read the room list, and
     * treating that refusal as "unsupported" would show the wrong error to
     * every attendee in the meeting.
     */
    async function applyRole({ sdk, role, screenName }: ApplyRoleInput) {
      if (!canManageRooms(role)) {
        if (!aliveRef.current) return;
        setValue((previous) => ({
          ...previous,
          state: "participant",
          role,
          screenName,
          sdkError: null,
        }));
        return;
      }

      const probeError = await probeBreakoutSupport(sdk);
      if (!aliveRef.current) return;

      setValue((previous) => ({
        ...previous,
        state: probeError ? "unsupported" : "host",
        role,
        screenName,
        sdkError: probeError,
      }));
    }

    /** Reports the current role to the backend without breaking the UI if it fails. */
    async function syncSession(role: ZoomRole) {
      const parentUUID = meetingUUIDRef.current;
      if (!parentUUID) return;

      try {
        const sessionState = await postSession(parentUUID, role);
        if (!aliveRef.current || sessionState === null) return;
        setValue((previous) => ({ ...previous, sessionState }));
      } catch (error) {
        // A backend hiccup must not blank the screen the user already has.
        console.error("Session sync failed:", error);
      }
    }

    /**
     * Re-routes on the spot when the host promotes or demotes this user. No
     * reload happens: the state change alone swaps the screen.
     */
    function handleUserContextChange(event: ZoomUserContextChangeEvent) {
      const sdk = window.zoomSdk;
      if (!aliveRef.current || !sdk) return;

      void applyRole({ sdk, role: event.role, screenName: event.screenName ?? "" });
      void syncSession(event.role);
    }

    /**
     * True once onMyUserContextChange has actually been attached. The SDK
     * refuses a removeEventListener call that arrives before config() resolves,
     * so the cleanup below has to know whether there is anything to detach.
     */
    let listenerAttached = false;

    async function detectRole() {
      const bootstrap = await configureZoomSdk();
      if (!aliveRef.current) return;

      if (bootstrap.kind === "unavailable") {
        setValue({ ...INITIAL, state: "unsupported", sdkError: bootstrap.error });
        return;
      }

      const { sdk, meetingUUID } = bootstrap;

      meetingUUIDRef.current = meetingUUID;
      setValue((previous) => ({ ...previous, meetingUUID }));

      // Subscribed before the first role read, so a promotion that lands during
      // initialisation is not missed.
      sdk.onMyUserContextChange(handleUserContextChange);
      listenerAttached = true;

      const context = await sdk.getUserContext();

      await applyRole({ sdk, role: context.role, screenName: context.screenName });
      await syncSession(context.role);
    }

    detectRole().catch((error) => {
      if (!aliveRef.current) return;
      setValue({
        ...INITIAL,
        state: "unsupported",
        sdkError: normalizeSdkError(error, "ZOOM_INIT_FAILED"),
      });
    });

    return () => {
      aliveRef.current = false;

      if (!listenerAttached) return;

      // The SDK has no offMyUserContextChange, so removeEventListener is the
      // only supported way to detach the handler. It returns undefined instead
      // of a promise on the paths where it declines the call, so the result is
      // normalised before any rejection is reported.
      const removal = window.zoomSdk?.removeEventListener(
        "onMyUserContextChange",
        handleUserContextChange,
      );

      void Promise.resolve(removal).catch((error: unknown) => {
        console.error("Failed to detach onMyUserContextChange:", error);
      });
    };
  }, []);

  return value;
}
