import { Router } from "express";
import { anyoneInMeeting, hostOrCoHost } from "../services/app-context.ts";
import { HttpError } from "../services/http-error.ts";

import {
  addIdea,
  editIdea,
  getRoomResponses,
  getRoomResponsesForHost,
  removeIdea,
  setTick,
  submitAnswer,
  type RoomRef,
} from "../store/activity_responses.ts";
import { getRoundTasks } from "../store/tasks.ts";
import type { Activity, ApiResponse, RoomResponsesHostView, RoomResponsesView } from "../types/breakout.ts";

// Mounted at /api/responses.
//
// Two kinds of data meet here:
//   - activity definitions, written by the host, held by store/tasks.ts
//   - what participants wrote, held by store/activity_responses.ts
// Before every write this route reads the task to check the target activity or
// checklist item still exists, then hands the write to the responses store.
//
// Every response route returns the caller's view of the room (RoomResponsesView):
// everyone's notes and ticks, the caller's own answers, and only the
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
async function assertActivity(room: RoomRef, activityId: string, kind: Activity["kind"]): Promise<void> {
  const activity = (await getRoundTasks(room.parentUUID, room.roundId))?.activities.find(
    (candidate) => candidate.id === activityId,
  );
  if (!activity || activity.kind !== kind) {
    throw new HttpError("This activity no longer exists.", 404);
  }
}

/** 404 unless this room's task checklist holds the item. A room override replaces the round-wide task. */
async function assertChecklistItem(room: RoomRef, itemId: string): Promise<void> {
  const tasks = await getRoundTasks(room.parentUUID, room.roundId);
  const checklist = (tasks?.rooms[room.roomId] ?? tasks?.all)?.checklist ?? [];
  if (!checklist.some((item) => item.id === itemId)) {
    throw new HttpError("This checklist item no longer exists.", 404);
  }
}

/**
 * GET /api/responses/:roundId/rooms/:roomId?parentUUID=<meeting uuid>&participantUUID=<caller>
 * The caller's view of the room. A room nobody has written to returns empty maps.
 */
router.get("/:roundId/rooms/:roomId", anyoneInMeeting, async (req, res) => {
  const { roundId, roomId } = req.params;
  const room = { parentUUID: res.locals.caller.meetingUUID, roundId, roomId };
  const body: ApiResponse<RoomResponsesView> = {
    success: true,
    data: await getRoomResponses(room, req.query.participantUUID),
  };
  res.json(body);
});

/**
 * GET /api/responses/:roundId/rooms/:roomId/all?parentUUID=<meeting uuid>
 * The host's view of the room: every submitted answer, every note and tick. Host and co-hosts only.
 */
router.get("/:roundId/rooms/:roomId/all", hostOrCoHost, async (req, res) => {
  const { roundId, roomId } = req.params;
  const room = { parentUUID: res.locals.caller.meetingUUID, roundId, roomId };
  const body: ApiResponse<RoomResponsesHostView> = { success: true, data: await getRoomResponsesForHost(room) };
  res.json(body);
});

/**
 * PUT /api/responses/:roundId/rooms/:roomId/answers/:activityId
 * Body: SaveAnswerRequest. Autosave sends "working"; "Submit to host" sends "submitted".
 *
 */
router.put("/:roundId/rooms/:roomId/answers/:activityId", anyoneInMeeting, async (req, res) => {
  const { roundId, roomId, activityId } = req.params;
  const room = { parentUUID: res.locals.caller.meetingUUID, roundId, roomId };
  await assertActivity(room, activityId, "individual");
  const view = await submitAnswer(room, activityId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.json(body);
});

/**
 * POST /api/responses/:roundId/rooms/:roomId/ideas/:activityId
 * Body: AddIdeaRequest. The server sets the note's id, "Idea N" title, author and color
 */
router.post("/:roundId/rooms/:roomId/ideas/:activityId", anyoneInMeeting, async (req, res) => {
  const { roundId, roomId, activityId } = req.params;
  const room = { parentUUID: res.locals.caller.meetingUUID, roundId, roomId };
  await assertActivity(room, activityId, "ideaBoard");
  const view = await addIdea(room, activityId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.status(201).json(body);
});

/**
 * PUT /api/responses/:roundId/rooms/:roomId/ideas/:activityId/:noteId
 * Body: EditIdeaRequest. Author only (403 otherwise).
 * 200: RoomResponsesView.
 */
router.put("/:roundId/rooms/:roomId/ideas/:activityId/:noteId", anyoneInMeeting, async (req, res) => {
  const { roundId, roomId, activityId, noteId } = req.params;
  const room = { parentUUID: res.locals.caller.meetingUUID, roundId, roomId };
  await assertActivity(room, activityId, "ideaBoard");
  const view = await editIdea(room, activityId, noteId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.json(body);
});

/**
 * DELETE /api/responses/:roundId/rooms/:roomId/ideas/:activityId/:noteId
 * Body: RemoveIdeaRequest (send Content-Type: application/json so the body is parsed). Author only.
 */
router.delete("/:roundId/rooms/:roomId/ideas/:activityId/:noteId", anyoneInMeeting, async (req, res) => {
  const { roundId, roomId, activityId, noteId } = req.params;
  const room = { parentUUID: res.locals.caller.meetingUUID, roundId, roomId };
  await assertActivity(room, activityId, "ideaBoard");
  const view = await removeIdea(room, activityId, noteId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.json(body);
});

/**
 * PUT /api/responses/:roundId/rooms/:roomId/ticks/:itemId
 * Body: TickRequest. Anyone in the room; the latest click wins.
 */
router.put("/:roundId/rooms/:roomId/ticks/:itemId", anyoneInMeeting, async (req, res) => {
  const { roundId, roomId, itemId } = req.params;
  const room = { parentUUID: res.locals.caller.meetingUUID, roundId, roomId };
  await assertChecklistItem(room, itemId);
  const view = await setTick(room, itemId, req.body);
  const body: ApiResponse<RoomResponsesView> = { success: true, data: view };
  res.json(body);
});

export default router;
