import { Router } from "express";
import { anyoneInMeeting, hostOrCoHost } from "../services/app-context.ts";

import { parseRoom } from "../store/activity_responses.ts";
import {
  getChallengesForHost,
  getRoomChallenge,
  launchChallenge,
  lockAnswer,
  pickOption,
  revealChallenge,
} from "../store/challenges.ts";
import type { ApiResponse, ChallengeView } from "../types/breakout.ts";

// Mounted at /api/challenges. Live polls and quizzes for the running round.
//
// The host's routes return every challenge of the round with live results.
// A room member's routes return the round's latest challenge as their room sees
// it: their room's picks and locks, and every room's results once revealed.
// Like /api/responses, a room member must be placed in that room by the plan.

const router = Router();

// Picks and locks change live; a browser must not reuse an old cached view.
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

/** GET /api/challenges/:roundId?parentUUID=<meeting uuid>. The host's list, oldest first. */
router.get("/:roundId", hostOrCoHost, (req, res) => {
  const body: ApiResponse<ChallengeView[]> = {
    success: true,
    data: getChallengesForHost(res.locals.caller.meetingUUID, req.params.roundId),
  };
  res.json(body);
});

/**
 * POST /api/challenges/:roundId. Body: LaunchChallengeRequest.
 * 409 when the round is not running or an earlier one still waits for its reveal.
 */
router.post("/:roundId", hostOrCoHost, (req, res) => {
  const body: ApiResponse<ChallengeView[]> = {
    success: true,
    data: launchChallenge(res.locals.caller.meetingUUID, req.params.roundId, req.body?.draft),
  };
  res.status(201).json(body);
});

/** POST /api/challenges/:roundId/:challengeId/reveal. Body: RevealChallengeRequest. */
router.post("/:roundId/:challengeId/reveal", hostOrCoHost, (req, res) => {
  const { roundId, challengeId } = req.params;
  const body: ApiResponse<ChallengeView[]> = {
    success: true,
    data: revealChallenge(res.locals.caller.meetingUUID, roundId, challengeId),
  };
  res.json(body);
});

/** GET /api/challenges/:roundId/rooms/:roomId?parentUUID&participantUUID. Null when none was launched. */
router.get("/:roundId/rooms/:roomId", anyoneInMeeting, (req, res) => {
  const { roundId, roomId } = req.params;
  const room = parseRoom({ parentUUID: res.locals.caller.meetingUUID, roundId, roomId });
  const body: ApiResponse<ChallengeView | null> = {
    success: true,
    data: getRoomChallenge(room, req.query.participantUUID),
  };
  res.json(body);
});

/** PUT /api/challenges/:roundId/:challengeId/rooms/:roomId/picks/:question. Body: ChallengeAnswerRequest. */
router.put("/:roundId/:challengeId/rooms/:roomId/picks/:question", anyoneInMeeting, (req, res) => {
  const { roundId, challengeId, roomId, question } = req.params;
  const room = parseRoom({ parentUUID: res.locals.caller.meetingUUID, roundId, roomId });
  const body: ApiResponse<ChallengeView | null> = {
    success: true,
    data: pickOption(room, challengeId, question, req.body),
  };
  res.json(body);
});

/**
 * POST /api/challenges/:roundId/:challengeId/rooms/:roomId/locks/:question. Body: ChallengeAnswerRequest.
 * 409 when the room already locked the question, or time is up.
 */
router.post("/:roundId/:challengeId/rooms/:roomId/locks/:question", anyoneInMeeting, (req, res) => {
  const { roundId, challengeId, roomId, question } = req.params;
  const room = parseRoom({ parentUUID: res.locals.caller.meetingUUID, roundId, roomId });
  const body: ApiResponse<ChallengeView | null> = {
    success: true,
    data: lockAnswer(room, challengeId, question, req.body),
  };
  res.json(body);
});

export default router;
