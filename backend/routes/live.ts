import { Router } from "express";
import {getWorkspace, markRoundStatus} from "../store/workspace.ts"
import { applyRoster, extendRound, getLive, markClosedRound, markLaunchedRound, subscribe } from "../store/live.ts";
import type { ApiResponse, LiveActionResponse, LiveState, RosterEntry, Workspace } from "../types/breakout.ts";

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
  // Must run before getWorkspace below, or the reply carries the pre-bump revision.
  markRoundStatus(parentUUID, roundId, "launched");

  const body: ApiResponse<LiveActionResponse> = {
    success: true,
    data: { live: state, workspace: getWorkspace(parentUUID) ?? null },
  };
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
  const body: ApiResponse<LiveActionResponse> = {
    success: true,
    data: { live: state, workspace: getWorkspace(parentUUID) ?? null },
  };

  res.json(body);
});

/**
 * Skip a round the host does not want to run, or put a skipped one back.
 * The panel decides which rounds may be skipped; an unknown round is a no-op,
 * so this only ever reports the workspace as it now stands.
 */
router.post("/skip", (req, res) => {
  const parentUUID = parentUUIDFrom(req.body?.parentUUID);
  const roundId = parentUUIDFrom(req.body?.roundId);
  const skipped: unknown = req.body?.skipped;

  if (!parentUUID || !roundId || typeof skipped !== "boolean") {
    const body: ApiResponse<never> = {
      success: false,
      error: "parentUUID, roundId and a boolean skipped are required.",
    };
    res.status(400).json(body);
    return;
  }

  markRoundStatus(parentUUID, roundId, skipped ? "skipped" : "planned");

  const workspace = getWorkspace(parentUUID);
  if (!workspace) {
    const body: ApiResponse<never> = { success: false, error: "No workspace for this meeting." };
    res.status(404).json(body);
    return;
  }
  const body: ApiResponse<Workspace> = { success: true, data: workspace };
  res.json(body);
});

function isRosterEntry(value: unknown): value is RosterEntry {
  const entry = value as Partial<RosterEntry> | null;
  return (
    typeof entry?.participantUUID === "string" &&
    entry.participantUUID.length > 0 &&
    typeof entry.name === "string" &&
    typeof entry.isHost === "boolean" &&
    (entry.roomId === null || typeof entry.roomId === "string")
  );
}

/** The whole list or nothing: a partly valid roster would drop real participants. */
function rosterFrom(value: unknown): RosterEntry[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every(isRosterEntry) ? value : null;
}

/**
 * Who Zoom says is in the meeting, read by the host when the app opens.
 * An empty list is refused: a co-host's room list carries no people, and that
 * must not be read as everyone having left.
 */
router.post("/roster", (req, res) => {
  const parentUUID = parentUUIDFrom(req.body?.parentUUID);
  const participants = rosterFrom(req.body?.participants);
  if (!parentUUID || !participants) {
    console.log("roster: rejected, missing parentUUID or an empty/invalid participants list");
    const body: ApiResponse<never> = {
      success: false,
      error: "parentUUID and a non-empty list of valid participants are required.",
    };
    res.status(400).json(body);
    return;
  }
  const state = applyRoster(parentUUID, participants);
  const present = state.participants.filter((p) => p.location !== "left").length;
  console.log(`roster: ${participants.length} from Zoom for ${parentUUID}, ${present} now present`);
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
