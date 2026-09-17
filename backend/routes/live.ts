import { Router } from "express";

import { getLive, markClosedRound, markLaunchedRound, subscribe } from "../store/live.ts";
import type { ApiResponse, LiveState } from "../types/breakout.ts";

const router = Router();

function parentUUIDFrom(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Current live state for one meeting. Used by Refresh and debugging. */
router.get("/", (req, res) => {
  const parentUUID = parentUUIDFrom(req.query.parentUUID);
  if (!parentUUID) {
    const body: ApiResponse<never> = { success: false, error: "parentUUID is required." };
    res.status(400).json(body);
    return;
  }
  const body: ApiResponse<LiveState> = { success: true, data: getLive(parentUUID) };
  res.json(body);
});

/** Frontend calls this after the Zoom SDK created, assigned and opened rooms. */
router.post("/launch", (req, res) => {
  const parentUUID = parentUUIDFrom(req.body?.parentUUID);
  const roundId = parentUUIDFrom(req.body?.roundId);
  if (!parentUUID || !roundId) {
    const body: ApiResponse<never> = { success: false, error: "parentUUID and roundId are required." };
    res.status(400).json(body);
    return;
  }
  const state = markLaunchedRound(parentUUID, roundId);
  if (!state) {
    const body: ApiResponse<never> = { success: false, error: "Round plan not found." };
    res.status(404).json(body);
    return;
  }
  const body: ApiResponse<LiveState> = { success: true, data: state };
  res.json(body);
});

/** Frontend calls this after the Zoom SDK closed rooms. */
router.post("/close", (req, res) => {
  const parentUUID = parentUUIDFrom(req.body?.parentUUID);
  if (!parentUUID) {
    const body: ApiResponse<never> = { success: false, error: "parentUUID is required." };
    res.status(400).json(body);
    return;
  }
  const body: ApiResponse<LiveState> = { success: true, data: markClosedRound(parentUUID) };
  res.json(body);
});

/** Server-sent events: current state on connect, then every change until the client disconnects. */
router.get("/events", (req, res) => {
  const parentUUID = parentUUIDFrom(req.query.parentUUID);
  if (!parentUUID) {
    const body: ApiResponse<never> = { success: false, error: "parentUUID is required." };
    res.status(400).json(body);
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (state: LiveState) => {
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  };

  send(getLive(parentUUID));
  const unsubscribe = subscribe(parentUUID, send);
  req.on("close", unsubscribe);
});

export default router;
