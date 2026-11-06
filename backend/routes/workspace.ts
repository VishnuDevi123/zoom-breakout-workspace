import { Router } from "express";
import { anyoneInMeeting, hostOnly } from "../services/app-context.ts";
import { HttpError, isRecord } from "../services/http-error.ts";

import { getPastWorkflows } from "../store/templates.ts";
import {
  addRound,
  deleteRound,
  endWorkflow,
  getWorkspace,
  replaceWorkflow,
  saveWorkspace,
} from "../store/workspace.ts";
import type { ApiResponse, PastWorkflow, SaveWorkspaceRequest, Workspace } from "../types/breakout.ts";

const router = Router();

// Round lists change often; a browser must not reuse an old cached revision.
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// GET /api/workspace?parentUUID=<meeting uuid>
router.get("/", anyoneInMeeting, async (_req, res) => {
  const workspace = await getWorkspace(res.locals.caller.meetingUUID);
  if (!workspace) throw new HttpError("No workspace for this meeting.", 404);

  const body: ApiResponse<Workspace> = { success: true, data: workspace };
  res.json(body);
});

// PUT /api/workspace   body: SaveWorkspaceRequest. 201 on create (revision 1), 200 on update.
router.put("/", hostOnly, async (req, res) => {
  if (!isRecord(req.body)) throw new HttpError("The request body must be an object.", 400);
  const request = req.body as Partial<SaveWorkspaceRequest>;

  const saved = await saveWorkspace(request, request.expectedRevision);
  const body: ApiResponse<Workspace> = { success: true, data: saved };
  res.status(saved.revision === 1 ? 201 : 200).json(body);
});

// POST /api/workspace/rounds. The store validates every field.
router.post("/rounds", hostOnly, async (req, res) => {
  const saved = await addRound(res.locals.caller.meetingUUID, req.body);
  const body: ApiResponse<Workspace> = { success: true, data: saved };
  res.status(201).json(body);
});

// DELETE /api/workspace/rounds/:roundId?parentUUID=<meeting uuid>
router.delete("/rounds/:roundId", hostOnly, async (req, res) => {
  const saved = await deleteRound(res.locals.caller.meetingUUID, req.params.roundId);
  const body: ApiResponse<Workspace> = { success: true, data: saved };
  res.json(body);
});

// POST /api/workspace/end   body: EndWorkflowRequest. Returns this meeting's past workflows.
router.post("/end", hostOnly, async (req, res) => {
  const past = await endWorkflow(res.locals.caller.meetingUUID, req.body);
  const body: ApiResponse<PastWorkflow[]> = { success: true, data: past };
  res.json(body);
});

// GET /api/workspace/past?parentUUID=<meeting uuid>, newest first.
router.get("/past", hostOnly, async (_req, res) => {
  const body: ApiResponse<PastWorkflow[]> = { success: true, data: await getPastWorkflows(res.locals.caller.meetingUUID) };
  res.json(body);
});

// POST /api/workspace/replace   body: ReplaceWorkflowRequest. Only before the first launch.
router.post("/replace", hostOnly, async (req, res) => {
  const saved = await replaceWorkflow(res.locals.caller.meetingUUID, req.body);
  const body: ApiResponse<Workspace> = { success: true, data: saved };
  res.json(body);
});

export default router;
