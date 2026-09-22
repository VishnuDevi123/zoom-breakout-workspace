"use client";

import { useEffect, useRef, useState } from "react";

import {
  configureZoomSdk,
  normalizeSdkError,
  type SdkErrorInfo,
} from "@/lib/zoom-sdk";
import type { HostState, ZoomRole } from "@/types/breakout";

/**
 * Slice 1 host gate.
 *
 * Answers one question: what is this user allowed to do? -> getUserContext().role
 * Whether the client can actually drive breakouts is learned when a launch is
 * attempted; the SDK error is shown then, not guessed at on load.
 *
 * The SDK bootstrap itself lives in `lib/zoom-sdk.ts`, because slice 2 onwards
 * needs the configured SDK too and `config()` may only run once per page.
 */

interface ApplyRoleInput {
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
  /** Meeting title from getMeetingContext(). Empty until it resolves. */
  meetingTopic: string;
  /** Populated only in the "unsupported" state. */
  sdkError: SdkErrorInfo | null;
}

const INITIAL: HostGateValue = {
  state: "checking",
  role: null,
  screenName: "",
  meetingUUID: "",
  meetingTopic: "",
  sdkError: null,
};

/** Host and co-host are treated identically. Everyone else gets the participant screen. */
export function canManageRooms(role: ZoomRole | null): boolean {
  return role === "host" || role === "coHost";
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

    /** Turns a role into a screen. */
    function applyRole({ role, screenName }: ApplyRoleInput) {
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

      if (!aliveRef.current) return;
      setValue((previous) => ({
        ...previous,
        state: "host",
        role,
        screenName,
        sdkError: null,
      }));
    }

    /**
     * Re-routes on the spot when the host promotes or demotes this user. No
     * reload happens: the state change alone swaps the screen.
     */
    function handleUserContextChange(event: ZoomUserContextChangeEvent) {
      if (!aliveRef.current) return;
      applyRole({ role: event.role, screenName: event.screenName ?? "" });
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

      applyRole({ role: context.role, screenName: context.screenName });

      const { meetingTopic } = await sdk.getMeetingContext();
      if (!aliveRef.current) return;
      setValue((previous) => ({ ...previous, meetingTopic }));
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
