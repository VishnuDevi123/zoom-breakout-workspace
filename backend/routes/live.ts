import { Router } from "express";
import { anyoneInMeeting, hostOnly, hostOrCoHost } from "../services/app-context.ts";
import { HttpError } from "../services/http-error.ts";
import {getWorkspace, markRoundStatus} from "../store/workspace.ts"
import { revealRoundChallenges } from "../store/challenges.ts";
import { applyRoster, extendRound, getLive, linkRooms, markClosedRound, markLaunchedRound, setRoomStatus, subscribe } from "../store/live.ts";
import type { ApiResponse, LiveActionResponse, LiveState, RoomLink, RoomStatus, RosterEntry, Workspace } from "../types/breakout.ts";

const router = Router();

function idFrom(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Frontend calls this after the Zoom SDK created, assigned and opened rooms. */
router.post("/launch", hostOnly, async (req, res) => {
  const parentUUID = res.locals.caller.meetingUUID;
  const roundId = idFrom(req.body?.roundId);
  if (!roundId) throw new HttpError("roundId is required.", 400);
  // Duration is workspace-owned. An unknown round means no timer: launch never gates on the workspace.
  const activeRound = (await getWorkspace(parentUUID))?.rounds.find(
    (round) => round.roundId === roundId,
  );
  const durationSec = activeRound?.durationSec ?? 0;
  const previousRoundId = (await getLive(parentUUID)).round?.roundId;

  const state = await markLaunchedRound(parentUUID, roundId, durationSec);
  if (!state) throw new HttpError("Round plan not found.", 404);
  // A launch replaces the live round, so an earlier one whose close report was lost
  // is over. Close it as /close would, or End Workflow stays blocked.
  if (previousRoundId && previousRoundId !== roundId) {
    await revealRoundChallenges(parentUUID, previousRoundId);
    await markRoundStatus(parentUUID, previousRoundId, "closed");
  }
  // Must run before getWorkspace below, or the reply carries the pre-bump revision.
  await markRoundStatus(parentUUID, roundId, "launched");

  const body: ApiResponse<LiveActionResponse> = {
    success: true,
    data: { live: state, workspace: await getWorkspace(parentUUID) ?? null },
  };
  res.json(body);
});

/** Widest single adjustment the host can make, in seconds. */
const MAX_ADJUST_SEC = 1800;

/** Add or remove time on the running round. Negative seconds shorten it. */
router.post("/extend", hostOrCoHost, async (req, res) => {
  const parentUUID = res.locals.caller.meetingUUID;
  const seconds = req.body?.seconds;
  // validate is seconds input is number
  const validSeconds =
    typeof seconds === "number" &&
    Number.isSafeInteger(seconds) &&
    seconds !== 0 &&
    Math.abs(seconds) <= MAX_ADJUST_SEC;

  if (!validSeconds) {
    throw new HttpError(`A non-zero whole number of seconds up to ${MAX_ADJUST_SEC} is required.`, 400);
  }

  const state = await extendRound(parentUUID, seconds);
  if (!state) throw new HttpError("No timed round is running.", 404);
  const body: ApiResponse<LiveState> = { success: true, data: state };
  res.json(body);
});

function isRoomStatus(value: unknown): value is RoomStatus {
  return value === "onTrack" || value === "moreTime" || value === "done";
}

/**
 * A participant tells the host how their room is doing. Refused when the round is
 * not the running one (409) or the plan does not place the caller in the room (403).
 */
router.post("/room-status", anyoneInMeeting, async (req, res) => {
  const parentUUID = res.locals.caller.meetingUUID;
  const roundId = idFrom(req.body?.roundId);
  const roomId = idFrom(req.body?.roomId);
  const participantUUID = idFrom(req.body?.participantUUID);
  const status: unknown = req.body?.status;
  if (!roundId || !roomId || !participantUUID || !isRoomStatus(status)) {
    throw new HttpError('roundId, roomId, participantUUID and a status of "onTrack", "moreTime" or "done" are required.', 400);
  }

  const result = await setRoomStatus({ parentUUID, roundId, roomId, participantUUID, status });
  if (result.kind === "notRunning") throw new HttpError("This round is not running.", 409);
  if (result.kind === "notInRoom") throw new HttpError("You are not in this room.", 403);
  const body: ApiResponse<LiveState> = { success: true, data: result.state };
  res.json(body);
});

/** Frontend calls this after the Zoom SDK closed rooms. */
router.post("/close", hostOnly, async (_req, res) => {
  const parentUUID = res.locals.caller.meetingUUID;
  const roundId = (await getLive(parentUUID)).round?.roundId;
  if (roundId) await revealRoundChallenges(parentUUID, roundId);
  const state = await markClosedRound(parentUUID);
  if (roundId) await markRoundStatus(parentUUID, roundId, "closed");
  const body: ApiResponse<LiveActionResponse> = {
    success: true,
    data: { live: state, workspace: await getWorkspace(parentUUID) ?? null },
  };

  res.json(body);
});

/**
 * Skip a round the host does not want to run, or put a skipped one back.
 * A round that has run is refused; an unknown round is a no-op, so this only
 * ever reports the workspace as it now stands.
 */
router.post("/skip", hostOnly, async (req, res) => {
  const parentUUID = res.locals.caller.meetingUUID;
  const roundId = idFrom(req.body?.roundId);
  const skipped: unknown = req.body?.skipped;

  if (!roundId || typeof skipped !== "boolean") throw new HttpError("roundId and a boolean skipped are required.", 400);

  // Only a round that has not run moves between planned and skipped.
  const status = (await getWorkspace(parentUUID))?.rounds.find((round) => round.roundId === roundId)?.status;
  if (status === "launched" || status === "closed") throw new HttpError("A round that has run cannot be skipped.", 409);
  await markRoundStatus(parentUUID, roundId, skipped ? "skipped" : "planned");

  const workspace = await getWorkspace(parentUUID);
  if (!workspace) throw new HttpError("No workspace for this meeting.", 404);
  const body: ApiResponse<Workspace> = { success: true, data: workspace };
  res.json(body);
});

function isRosterEntry(value: unknown): value is RosterEntry {
  const entry = value as Partial<RosterEntry> | null;
  return (
    typeof entry?.participantUUID === "string" &&
    entry.participantUUID.length > 0 &&
    typeof entry.name === "string" &&
    (entry.role === "host" || entry.role === "coHost" || entry.role === "attendee") &&
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
router.post("/roster", hostOnly, async (req, res) => {
  const parentUUID = res.locals.caller.meetingUUID;
  const participants = rosterFrom(req.body?.participants);
  if (!participants) {
    console.log("roster: rejected, an empty or invalid participants list");
    throw new HttpError("A non-empty list of valid participants is required.", 400);
  }
  const state = await applyRoster(parentUUID, participants);
  const present = state.participants.filter((p) => p.location !== "left").length;
  console.log(`roster: ${participants.length} from Zoom for ${parentUUID}, ${present} now present`);
  const body: ApiResponse<LiveState> = { success: true, data: state };
  res.json(body);
});

function isRoomLink(value: unknown): value is RoomLink {
  const link = value as Partial<RoomLink> | null;
  return typeof link?.roomId === "string" && link.roomId.length > 0 && typeof link.roomUUID === "string" && link.roomUUID.length > 0;
}

/**
 * Which Zoom room each planned room runs in, read by the host from Zoom's room
 * list when someone shows up in a room webhooks could not name. 409 when the
 * round is no longer running.
 */
router.post("/room-links", hostOnly, async (req, res) => {
  const parentUUID = res.locals.caller.meetingUUID;
  const roundId = idFrom(req.body?.roundId);
  const links: unknown = req.body?.links;
  if (!roundId || !Array.isArray(links) || links.length === 0 || !links.every(isRoomLink)) {
    throw new HttpError("roundId and a non-empty list of room links are required.", 400);
  }
  const state = await linkRooms(parentUUID, roundId, links);
  if (!state) throw new HttpError("This round is not running.", 409);
  const body: ApiResponse<LiveState> = { success: true, data: state };
  res.json(body);
});

/** Server-sent events: current state on connect, then every change until the client disconnects. */
router.get("/events", anyoneInMeeting, async (req, res) => {
  const parentUUID = res.locals.caller.meetingUUID;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (state: LiveState) => {
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  };

  // Listen first, so a change during the first read is not missed.
  req.on("close", subscribe(parentUUID, send));
  send(await getLive(parentUUID));
});

export default router;
