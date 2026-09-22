import { Router, type ErrorRequestHandler } from "express";

import {
  addRound,
  deleteRound,
  getWorkspace,
  saveWorkspace,
  WorkspaceError,
} from "../store/workspace.ts";
import type { ApiResponse, SaveWorkspaceRequest, Workspace } from "../types/breakout.ts";

const router = Router();

// Round lists change often; a browser must not reuse an old cached revision.
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// GET /api/workspace?parentUUID=<meeting uuid>
router.get("/", (req, res) => {
  const workspace = getWorkspace(req.query.parentUUID);
  if (!workspace) {
    const body: ApiResponse<never> = { success: false, error: "No workspace for this meeting." };
    res.status(404).json(body);
    return;
  }

  const body: ApiResponse<Workspace> = { success: true, data: workspace };
  res.json(body);
});

// PUT /api/workspace   body: SaveWorkspaceRequest. 201 on create (revision 1), 200 on update.
router.put("/", (req, res) => {
  const input: unknown = req.body;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new WorkspaceError("The request body must be an object.", 400);
  }
  const request = input as Partial<SaveWorkspaceRequest>;

  const saved = saveWorkspace(request, request.expectedRevision);
  const body: ApiResponse<Workspace> = { success: true, data: saved };
  res.status(saved.revision === 1 ? 201 : 200).json(body);
});

// POST /api/workspace/rounds. The store validates every field.
router.post("/rounds", (req, res) => {
  const saved = addRound(req.body?.parentUUID, req.body);
  const body: ApiResponse<Workspace> = { success: true, data: saved };
  res.status(201).json(body);
});

// DELETE /api/workspace/rounds/:roundId?parentUUID=<meeting uuid>
router.delete("/rounds/:roundId", (req, res) => {
  const saved = deleteRound(req.query.parentUUID, req.params.roundId);
  const body: ApiResponse<Workspace> = { success: true, data: saved };
  res.json(body);
});

// Express catches synchronous throws from the handlers above. Return the same
// JSON envelope for validation/conflicts that the frontend uses for successes.
const handleWorkspaceError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof WorkspaceError) {
    const body: ApiResponse<never> = { success: false, error: error.message };
    res.status(error.status).json(body);
    return;
  }
  next(error);
};
router.use(handleWorkspaceError);

export default router;
