"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { markRoundClosed, markRoundLaunched, readSavedRoundPlan } from "@/lib/execution-api";
import { canManageRooms } from "@/lib/host-gate";
import { breakoutRoomsAreOpen, closeRoundInZoom, launchRoundInZoom } from "@/lib/launch-round";
import { configureZoomSdk, type ZoomSdk } from "@/lib/zoom-sdk";
import type { RoundPlanDraft, ZoomRole } from "@/types/breakout";

/**
 * Zoom keeps the previous round's rooms locked for a moment after a close, so a
 * launch fired straight after one is rejected. The press registers at once and
 * the SDK work starts after this pause.
 */
const LAUNCH_DELAY_MS = 1_500;

export type LiveOperationState =
  | { kind: "idle" }
  | { kind: "running"; operation: "launch" | "close"; step: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

interface ControllerInput {
  parentUUID: string;
  role: ZoomRole | null;
  round: RoundPlanDraft;
  /** Persist pending draft edits; resolves false when the save failed. */
  flushSave: () => Promise<boolean>;
  /** Called once Zoom opened the rooms and the backend recorded the launch. */
  onLaunched?: (roundId: string) => void;
  /** Called once Zoom closed the rooms and the backend recorded the close. */
  onClosed?: () => void;
}

/**
 * Launch and close one round. The frontend is the only Zoom actor; the backend
 * is told after each SDK call succeeds and learns everything else from webhooks.
 */
export function useLiveRoomController(input: ControllerInput) {
  const [operation, setOperation] = useState<LiveOperationState>({ kind: "idle" });
  const aliveRef = useRef(true);
  const roleRef = useRef(input.role);

  useEffect(() => {
    roleRef.current = input.role;
  }, [input.role]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /**
   * Returns the SDK wrapped in an object. The SDK is a Proxy that turns every
   * property read into an API call, so resolving a promise with it directly
   * makes JavaScript probe `.then` and Zoom answers with a timeout error.
   */
  async function hostSdk(): Promise<{ sdk: ZoomSdk; hostUUID: string }> {
    if (!canManageRooms(roleRef.current)) throw new Error("Only the host or a co-host can do this.");
    const bootstrap = await configureZoomSdk();
    if (bootstrap.kind === "unavailable") throw new Error(bootstrap.error.message);
    const current = await bootstrap.sdk.getUserContext();
    if (!canManageRooms(current.role)) throw new Error("Zoom no longer reports host permission.");
    return { sdk: bootstrap.sdk, hostUUID: current.participantUUID };
  }

  async function run(kind: "launch" | "close", task: (step: (s: string) => void) => Promise<string>) {
    if (operation.kind === "running") return;
    let lastStep = "Checking Zoom…";
    const toastId = toast.loading(lastStep);
    const step = (s: string) => {
      lastStep = s;
      toast.loading(s, { id: toastId });
      setOperation({ kind: "running", operation: kind, step: s });
    };
    step(lastStep);
    try {
      const message = await task(step);
      toast.success(message, { id: toastId });
      if (aliveRef.current) setOperation({ kind: "success", message });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Zoom operation failed.";
      toast.error(lastStep, { id: toastId, description: reason });
      if (aliveRef.current) setOperation({ kind: "error", message: `${lastStep} ${reason}` });
    }
  }

  /** Defaults to the round the caller is showing; pass an id to start a different one. */
  function launch(roundId: string = input.round.roundId) {
    void run("launch", async (step) => {
      if (!(await input.flushSave())) throw new Error("Draft must save before launching.");
      await new Promise((resolve) => setTimeout(resolve, LAUNCH_DELAY_MS));
      const plan = await readSavedRoundPlan(input.parentUUID, roundId);
      const { sdk, hostUUID } = await hostSdk();
      await launchRoundInZoom(sdk, plan, hostUUID, step);
      await markRoundLaunched(input.parentUUID, plan.roundId);
      input.onLaunched?.(plan.roundId);
      return `${plan.title} launched.`;
    });
  }

  function close() {
    void run("close", async () => {
      const { sdk } = await hostSdk();
      await closeRoundInZoom(sdk);
      await markRoundClosed(input.parentUUID);
      input.onClosed?.();
      return `${input.round.title} closed.`;
    });
  }

  /**
   * One shot when the app opens on a round the backend still calls live. Zoom
   * emits no event when its rooms close, so a host who closed them from the Zoom
   * client - or reopened this app later - would otherwise be stuck with a round
   * that cannot be launched again.
   */
  function reconcile() {
    void (async () => {
      try {
        const { sdk } = await hostSdk();
        if (await breakoutRoomsAreOpen(sdk)) return;
        await markRoundClosed(input.parentUUID);
        input.onClosed?.();
        toast.info("Zoom had already closed these rooms. The round is cleared.");
      } catch {
        // Nothing to report: the host can still end the round by hand.
      }
    })();
  }

  return { operation, launch, close, reconcile };
}
