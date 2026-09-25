import { Router } from "express";
import {getWorkspace, markRoundStatus} from "../store/workspace.ts"
import { extendRound, getLive, markClosedRound, markLaunchedRound, subscribe } from "../store/live.ts";
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
  // Duration is workspace-owned. An unknown round means no timer: launch never gates on the workspace.
  const activeRound = getWorkspace(parentUUID)?.rounds.find(
    (round) => round.roundId === roundId,
  );
  const durationSec = activeRound?.durationSec ?? 0;

  const state = markLaunchedRound(parentUUID, roundId, durationSec);
  if (!state) {
    const body: ApiResponse<never> = { success: false, error: "Round plan not found." };
    res.status(404).json(body);
    return;
  }
  const body: ApiResponse<LiveState> = { success: true, data: state };
  markRoundStatus(parentUUID, roundId, "launched");
  res.json(body);
});

/** Widest single adjustment the host can make, in seconds. */
const MAX_ADJUST_SEC = 1800;

/** Add or remove time on the running round. Negative seconds shorten it. */
router.post("/extend", (req, res) => {
  const parentUUID = parentUUIDFrom(req.body?.parentUUID);
  const seconds = req.body?.seconds;
  // validate is seconds input is number
  const validSeconds =
    typeof seconds === "number" &&
    Number.isSafeInteger(seconds) &&
    seconds !== 0 &&
    Math.abs(seconds) <= MAX_ADJUST_SEC;

  if (!parentUUID || !validSeconds) {
    const body: ApiResponse<never> = {
      success: false,
      error: `parentUUID and a non-zero whole number of seconds up to ${MAX_ADJUST_SEC} are required.`,
    };
    res.status(400).json(body);
    return;
  }

  const state = extendRound(parentUUID, seconds);
  if (!state) {
    const body: ApiResponse<never> = { success: false, error: "No timed round is running." };
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
  const roundId = getLive(parentUUID).round?.roundId;
  const state = markClosedRound(parentUUID);
  if (roundId) markRoundStatus(parentUUID, roundId, "closed");
  const body: ApiResponse<LiveState> = { success: true, data: state };
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
