"use client";

import { useEffect, useRef, useState } from "react";

import { markRoundClosed, markRoundLaunched, readSavedRoundPlan } from "@/lib/execution-api";
import { canManageRooms } from "@/lib/host-gate";
import { closeRoundInZoom, launchRoundInZoom } from "@/lib/launch-round";
import { configureZoomSdk, type ZoomSdk } from "@/lib/zoom-sdk";
import type { RoundPlanDraft, ZoomRole } from "@/types/breakout";

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
    const step = (s: string) => {
      lastStep = s;
      setOperation({ kind: "running", operation: kind, step: s });
    };
    step(lastStep);
    try {
      const message = await task(step);
      if (aliveRef.current) setOperation({ kind: "success", message });
    } catch (error) {
      if (aliveRef.current) {
        const reason = error instanceof Error ? error.message : "Zoom operation failed.";
        setOperation({ kind: "error", message: `${lastStep} ${reason}` });
      }
    }
  }

  function launch() {
    void run("launch", async (step) => {
      if (!(await input.flushSave())) throw new Error("Draft must save before launching.");
      const plan = await readSavedRoundPlan(input.parentUUID, input.round.roundId);
      const { sdk, hostUUID } = await hostSdk();
      await launchRoundInZoom(sdk, plan, hostUUID, step);
      await markRoundLaunched(input.parentUUID, plan.roundId);
      return `${plan.title} launched.`;
    });
  }

  function close() {
    void run("close", async () => {
      const { sdk } = await hostSdk();
      await closeRoundInZoom(sdk);
      await markRoundClosed(input.parentUUID);
      return `${input.round.title} closed.`;
    });
  }

  return { operation, launch, close };
}
