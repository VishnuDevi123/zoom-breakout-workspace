import { Router, type ErrorRequestHandler } from "express";

import { AppContextError, ownerUidFrom } from "../services/app-context.ts";
import { addTemplate, deleteTemplate, getTemplates, saveTemplate, TemplateError } from "../store/templates.ts";
import { snapshotWorkflow, WorkspaceError } from "../store/workspace.ts";
import type { ApiResponse, SavedTemplate } from "../types/breakout.ts";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Every template belongs to the Zoom user in the request's X-Zoom-App-Context token.
// A missing, expired or guest token stops here with 401/403 (see handleTemplateError).
router.use((req, res, next) => {
  res.locals.ownerUid = ownerUidFrom(req.get("X-Zoom-App-Context"));
  next();
});

// GET /api/templates, newest first.
router.get("/", (_req, res) => {
  const ownerUid: string = res.locals.ownerUid;
  const body: ApiResponse<SavedTemplate[]> = { success: true, data: getTemplates(ownerUid) };
  res.json(body);
});

// POST /api/templates   body: SaveTemplateRequest. Copies one past workflow of this meeting.
router.post("/", (req, res) => {
  const ownerUid: string = res.locals.ownerUid;
  const body: ApiResponse<SavedTemplate> = { success: true, data: saveTemplate(ownerUid, req.body) };
  res.status(201).json(body);
});

// POST /api/templates/current   body: SaveCurrentTemplateRequest. Saves the workflow being built.
// The frontend checks the rooms are set; the server only stores what is there.
router.post("/current", (req, res) => {
  const ownerUid: string = res.locals.ownerUid;
  const snapshot = snapshotWorkflow(req.body?.parentUUID);
  const body: ApiResponse<SavedTemplate> = { success: true, data: addTemplate(ownerUid, snapshot) };
  res.status(201).json(body);
});

// DELETE /api/templates/:templateId. Returns the templates left.
router.delete("/:templateId", (req, res) => {
  const ownerUid: string = res.locals.ownerUid;
  const body: ApiResponse<SavedTemplate[]> = { success: true, data: deleteTemplate(ownerUid, req.params.templateId) };
  res.json(body);
});

// Same envelope as routes/workspace.ts: store throws, router turns it into JSON.
const handleTemplateError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof TemplateError || error instanceof WorkspaceError || error instanceof AppContextError) {
    const body: ApiResponse<never> = { success: false, error: error.message };
    res.status(error.status).json(body);
    return;
  }
  next(error);
};
router.use(handleTemplateError);

export default router;
