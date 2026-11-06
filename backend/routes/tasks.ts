import { Router } from "express";
import { anyoneInMeeting, hostOrCoHost } from "../services/app-context.ts";
import { HttpError, isRecord } from "../services/http-error.ts";

import { getRoundTasks, saveRoundTasks } from "../store/tasks.ts";
import type {
  ApiResponse,
  RoundTasks,
  SaveRoundTasksRequest,
} from "../types/breakout.ts";

const router = Router();

// Tasks change live; a browser must not reuse an old cached revision.
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// GET /api/tasks/:roundId?parentUUID=<meeting uuid>
router.get("/:roundId", anyoneInMeeting, async (req, res) => {
  const roundTasks = await getRoundTasks(res.locals.caller.meetingUUID, req.params.roundId);
  if (!roundTasks) throw new HttpError("No tasks for this round.", 404);

  const body: ApiResponse<RoundTasks> = { success: true, data: roundTasks };
  res.json(body);
});

// PUT /api/tasks/:roundId   body: SaveRoundTasksRequest. 201 on create (revision 1), 200 on update.
router.put("/:roundId", hostOrCoHost, async (req, res) => {
  if (!isRecord(req.body)) throw new HttpError("The request body must be an object.", 400);
  const request = req.body as Partial<SaveRoundTasksRequest>;
  if (request.roundId !== req.params.roundId) {
    throw new HttpError("roundId in the body must match the URL.", 400);
  }
  
  const saved = await saveRoundTasks(request, request.expectedRevision);
  const body: ApiResponse<RoundTasks> = { success: true, data: saved };
  res.status(saved.revision === 1 ? 201 : 200).json(body);
});

export default router;
