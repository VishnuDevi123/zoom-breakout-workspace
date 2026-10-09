import { Router, type ErrorRequestHandler } from "express";

import { addTemplate, deleteTemplate, getTemplates, saveTemplate, TemplateError } from "../store/templates.ts";
import { snapshotWorkflow, WorkspaceError } from "../store/workspace.ts";
import type { ApiResponse, SavedTemplate } from "../types/breakout.ts";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// GET /api/templates?hostUUID=<host participantUUID>, newest first.
router.get("/", (req, res) => {
  const body: ApiResponse<SavedTemplate[]> = { success: true, data: getTemplates(req.query.hostUUID) };
  res.json(body);
});

// POST /api/templates   body: SaveTemplateRequest. Copies one past workflow of this meeting.
router.post("/", (req, res) => {
  const body: ApiResponse<SavedTemplate> = { success: true, data: saveTemplate(req.body) };
  res.status(201).json(body);
});

// POST /api/templates/current   body: SaveCurrentTemplateRequest. Saves the workflow being built.
// The frontend checks the rooms are set; the server only stores what is there.
router.post("/current", (req, res) => {
  const snapshot = snapshotWorkflow(req.body?.parentUUID);
  const body: ApiResponse<SavedTemplate> = { success: true, data: addTemplate(req.body?.hostUUID, snapshot) };
  res.status(201).json(body);
});

// DELETE /api/templates/:templateId?hostUUID=<host participantUUID>. Returns the templates left.
router.delete("/:templateId", (req, res) => {
  const body: ApiResponse<SavedTemplate[]> = {
    success: true,
    data: deleteTemplate(req.query.hostUUID, req.params.templateId),
  };
  res.json(body);
});

// Same envelope as routes/workspace.ts: store throws, router turns it into JSON.
const handleTemplateError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof TemplateError || error instanceof WorkspaceError) {
    const body: ApiResponse<never> = { success: false, error: error.message };
    res.status(error.status).json(body);
    return;
  }
  next(error);
};
router.use(handleTemplateError);

export default router;
