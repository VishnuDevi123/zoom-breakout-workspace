"use client";

import { useEffect, useRef, useState } from "react";

import {
  configureZoomSdk,
  forgetHostCapabilities,
  grantHostCapabilities,
  normalizeSdkError,
  type SdkErrorInfo,
  type ZoomSdk,
} from "@/lib/zoom-sdk";
import type { HostState, ZoomRole } from "@/types/breakout";

/**
 * Slice 1 host gate.
 *
 * Answers one question: what is this user allowed to do? -> getUserContext().role
 * A host or co-host then needs the breakout capabilities, which is a second
 * `config()` call; if that one is refused, this client cannot drive breakouts
 * and the SDK's own error is shown instead of a host screen it cannot use.
 *
 * The SDK bootstrap itself lives in `lib/zoom-sdk.ts`, which owns both stages.
 */

interface ApplyRoleInput {
  role: ZoomRole;
  /** Display name from the SDK. Empty when a change event omits it. */
  screenName: string;
}

/** Stable for the whole meeting, including across breakout room hops. */
type ParticipantUUID = string;

export interface HostGateValue {
  state: HostState;
  /** Raw SDK role. Null until getUserContext() resolves. */
  role: ZoomRole | null;
  screenName: string;
  /** The main meeting, even when this client sits inside a breakout room. */
  meetingUUID: string;
  /** This user's own UUID. Empty until getUserContext() resolves. */
  participantUUID: ParticipantUUID;
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
  participantUUID: "",
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

  /** Needed by the role-change handler, which fires long after the bootstrap. */
  const sdkRef = useRef<ZoomSdk | null>(null);

  useEffect(() => {
    aliveRef.current = true;

    /**
     * Turns a role into a screen. A host seat is claimed only after the breakout
     * capabilities are actually granted, so the host screen never renders
     * controls this client would be refused for.
     */
    async function applyRole({ role, screenName }: ApplyRoleInput) {
      if (!canManageRooms(role)) {
        forgetHostCapabilities();
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

      const sdk = sdkRef.current;
      const capabilityError = sdk ? await grantHostCapabilities(sdk) : null;
      if (!aliveRef.current) return;

      if (capabilityError) {
        setValue({ ...INITIAL, state: "unsupported", sdkError: capabilityError });
        return;
      }

      setValue((previous) => ({
        ...previous,
        state: "host",
        role,
        screenName,
        sdkError: null,
      }));

      if (!sdk) return;

      // Both of these are host-only and only become callable once the second
      // config() above resolves, so neither can run during the bootstrap.
      if (!listenerAttached) {
        sdk.onMyUserContextChange(handleUserContextChange);
        listenerAttached = true;
      }

      // A missing meeting title is cosmetic: the workspace has its own name.
      const context = await sdk.getMeetingContext().catch(() => null);
      if (!aliveRef.current || !context) return;
      setValue((previous) => ({ ...previous, meetingTopic: context.meetingTopic }));
    }

    /**
     * Re-routes on the spot when the host promotes or demotes this user. No
     * reload happens: the state change alone swaps the screen.
     */
    function handleUserContextChange(event: ZoomUserContextChangeEvent) {
      if (!aliveRef.current) return;
      void applyRole({ role: event.role, screenName: event.screenName ?? "" });
    }

    /**
     * True once onMyUserContextChange has actually been attached. The SDK
     * refuses a removeEventListener call that arrives before config() resolves,
     * so the cleanup below has to know whether there is anything to detach.
     * An attendee never attaches it: the event is host-only.
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

      sdkRef.current = sdk;
      meetingUUIDRef.current = meetingUUID;
      setValue((previous) => ({ ...previous, meetingUUID }));

      const context = await sdk.getUserContext();
      if (!aliveRef.current) return;

      setValue((previous) => ({ ...previous, participantUUID: context.participantUUID }));
      await applyRole({ role: context.role, screenName: context.screenName });
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
