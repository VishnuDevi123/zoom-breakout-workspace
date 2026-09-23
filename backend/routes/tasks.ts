import { Router, type ErrorRequestHandler } from "express";

import { getRoundTasks, saveRoundTasks, TaskError } from "../store/tasks.ts";
import type { ApiResponse, RoundTasks, SaveRoundTasksRequest } from "../types/breakout.ts";

const router = Router();

// Tasks change live; a browser must not reuse an old cached revision.
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// GET /api/tasks/:roundId?parentUUID=<meeting uuid>
router.get("/:roundId", (req, res) => {
  const roundTasks = getRoundTasks(req.query.parentUUID, req.params.roundId);
  // if roundTasks empty
  if (!roundTasks) {
    const body: ApiResponse<never> = { success: false, error: "No tasks for this round." };
    res.status(404).json(body);
    return;
  }

  const body: ApiResponse<RoundTasks> = { success: true, data: roundTasks };
  res.json(body);
});

// PUT /api/tasks/:roundId   body: SaveRoundTasksRequest. 201 on create (revision 1), 200 on update.
router.put("/:roundId", (req, res) => {
  const input = req.body;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TaskError("The request body must be an object.", 400);
  }
  const request = input as Partial<SaveRoundTasksRequest>;
  if (request.roundId !== req.params.roundId) {
    throw new TaskError("roundId in the body must match the URL.", 400);
  }
  
  const saved = saveRoundTasks(request, request.expectedRevision);
  const body: ApiResponse<RoundTasks> = { success: true, data: saved };
  res.status(saved.revision === 1 ? 201 : 200).json(body);
});

// Same envelope as routes/workspace.ts: store throws, router turns it into JSON.
const handleTaskError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof TaskError) {
    const body: ApiResponse<never> = { success: false, error: error.message };
    res.status(error.status).json(body);
    return;
  }
  next(error);
};
router.use(handleTaskError);

export default router;
