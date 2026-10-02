import { Router, type ErrorRequestHandler } from "express";

import {
  addIdea,
  editIdea,
  getRoomResponses,
  markReady,
  parseRoom,
  removeIdea,
  ResponseError,
  setTick,
  submitAnswer,
  type RoomRef,
} from "../store/activity_responses.ts";
import { getRoundTasks } from "../store/tasks.ts";
import type { Activity, ApiResponse, RoomResponsesView } from "../types/breakout.ts";

// Mounted at /api/responses.
//
// Two kinds of data meet here:
//   - activity definitions, written by the host, held by store/tasks.ts
//   - what participants wrote, held by store/activity_responses.ts
// Before every write this route reads the task to check the target activity or
// checklist item still exists, then hands the write to the responses store.
//
// Every response route returns the caller's view of the room (RoomResponsesView):
// everyone's notes, ready marks and ticks, the caller's own answers, and only the
// status of everyone else's answers. Each write also bumps the room's counter in
// LiveState.roomRevisions, so the room's other participants refetch.
//
// Errors use the usual envelope, e.g. 403:
//   { "success": false, "error": "You are not in this room." }

const router = Router();

// Responses change live; a browser must not reuse an old cached view.
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

/** 404 unless the round's task holds an activity with this id and kind. */
function assertActivity(room: RoomRef, activityId: string, kind: Activity["kind"]): void {
  const activity = getRoundTasks(room.parentUUID, room.roundId)?.activities.find(
    (candidate) => candidate.id === activityId,
  );
  if (!activity || activity.kind !== kind) {
    throw new ResponseError("This activity no longer exists.", 404);
  }
}

/** 404 unless this room's task checklist holds the item. A room override replaces the round-wide task. */
function assertChecklistItem(room: RoomRef, itemId: string): void {
  const tasks = getRoundTasks(room.parentUUID, room.roundId);
  const checklist = (tasks?.rooms[room.roomId] ?? tasks?.all)?.checklist ?? [];
  if (!checklist.some((item) => item.id === itemId)) {
    throw new ResponseError("This checklist item no longer exists.", 404);
  }
}

/**
 * GET /api/responses/:roundId/activities?parentUUID=<meeting uuid>
 * The round's activities, read from the task store. No room check: definitions
 * are the same for every room. A round with no task yet has no activities.
 */
router.get("/:roundId/activities", (req, res) => {
  const parentUUID = req.query.parentUUID;
  if (typeof parentUUID !== "string" || !parentUUID.trim()) {
    throw new ResponseError("parentUUID must be a non-empty string.", 400);
  }
  const activities = getRoundTasks(parentUUID, req.params.roundId)?.activities ?? [];
  const body: ApiResponse<Activity[]> = { success: true, data: activities };
  res.json(body);
});

/**
 * GET /api/responses/:roundId/rooms/:roomId?parentUUID=<meeting uuid>&participantUUID=<caller>
 * The caller's view of the room. A room nobody has written to returns empty maps.
 */
router.get("/:roundId/rooms/:roomId", (req, res) => {
  const { roundId, roomId } = req.params;
  const room = parseRoom({ parentUUID: req.query.parentUUID, roundId, roomId });
  const body: ApiResponse<RoomResponsesView> = {
    success: true,
    data: getRoomResponses(room, req.query.participantUUID),
  };
  res.json(body);
});


/**
 * PUT /api/responses/:roundId/rooms/:roomId/answers/:activityId
 * Body: SaveAnswerRequest. Autosave sends "working"; "Submit to host" sends "submitted".
 *
 */
router.put("/:roundId/rooms/:roomId/answers/:activityId", (req, res) => {
  const { roundId, roomId, activityId } = req.params;
  const room = parseRoom({ parentUUID: req.body?.parentUUID, roundId, roomId });
  assertActivity(room, activityId, "individual");
  const view = submitAnswer(room, activityId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.json(body);
});

/**
 * POST /api/responses/:roundId/rooms/:roomId/ideas/:activityId
 * Body: AddIdeaRequest. The server sets the note's id, "Idea N" title, author and color
 */
router.post("/:roundId/rooms/:roomId/ideas/:activityId", (req, res) => {
  const { roundId, roomId, activityId } = req.params;
  const room = parseRoom({ parentUUID: req.body?.parentUUID, roundId, roomId });
  assertActivity(room, activityId, "ideaBoard");
  const view = addIdea(room, activityId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.status(201).json(body);
});

/**
 * PUT /api/responses/:roundId/rooms/:roomId/ideas/:activityId/:noteId
 * Body: EditIdeaRequest. Author only (403 otherwise).
 * 200: RoomResponsesView.
 */
router.put("/:roundId/rooms/:roomId/ideas/:activityId/:noteId", (req, res) => {
  const { roundId, roomId, activityId, noteId } = req.params;
  const room = parseRoom({ parentUUID: req.body?.parentUUID, roundId, roomId });
  assertActivity(room, activityId, "ideaBoard");
  const view = editIdea(room, activityId, noteId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.json(body);
});

/**
 * DELETE /api/responses/:roundId/rooms/:roomId/ideas/:activityId/:noteId
 * Body: RemoveIdeaRequest (send Content-Type: application/json so the body is parsed). Author only.
 */
router.delete("/:roundId/rooms/:roomId/ideas/:activityId/:noteId", (req, res) => {
  const { roundId, roomId, activityId, noteId } = req.params;
  const room = parseRoom({ parentUUID: req.body?.parentUUID, roundId, roomId });
  assertActivity(room, activityId, "ideaBoard");
  const view = removeIdea(room, activityId, noteId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.json(body);
});

/**
 * PUT /api/responses/:roundId/rooms/:roomId/ready/:activityId
 * Body: MarkReadyRequest. true marks the caller ready on this board, false undoes it.
 *
 * Example body: { "parentUUID": "...", "participantUUID": "p-ana", "ready": true }
 * 200: RoomResponsesView, with "p-ana" in ready.a2.
 */
router.put("/:roundId/rooms/:roomId/ready/:activityId", (req, res) => {
  const { roundId, roomId, activityId } = req.params;
  const room = parseRoom({ parentUUID: req.body?.parentUUID, roundId, roomId });
  assertActivity(room, activityId, "ideaBoard");
  const view = markReady(room, activityId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.json(body);
});

/**
 * PUT /api/responses/:roundId/rooms/:roomId/ticks/:itemId
 * Body: TickRequest. Anyone in the room; the latest click wins.
 */
router.put("/:roundId/rooms/:roomId/ticks/:itemId", (req, res) => {
  const { roundId, roomId, itemId } = req.params;
  const room = parseRoom({ parentUUID: req.body?.parentUUID, roundId, roomId });
  assertChecklistItem(room, itemId);
  const view = setTick(room, itemId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.json(body);
});

// Same envelope as routes/tasks.ts: store and checks throw, the router turns it into JSON.
const handleResponseError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof ResponseError) {
    const body: ApiResponse<never> = { success: false, error: error.message };
    res.status(error.status).json(body);
    return;
  }
  next(error);
};
router.use(handleResponseError);

export default router;
