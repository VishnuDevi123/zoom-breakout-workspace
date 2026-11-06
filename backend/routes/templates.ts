import { Router } from "express";

import { hostOnly, ownerUidFrom } from "../services/app-context.ts";
import { addTemplate, deleteTemplate, getTemplates, saveTemplate } from "../store/templates.ts";
import { snapshotWorkflow } from "../store/workspace.ts";
import type { ApiResponse, SavedTemplate } from "../types/breakout.ts";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Every template belongs to the Zoom user in the request's X-Zoom-App-Context token.
// A missing, expired or guest token stops here with 401/403.
router.use((req, res, next) => {
  res.locals.ownerUid = ownerUidFrom(req.get("X-Zoom-App-Context"));
  next();
});

// GET /api/templates, newest first.
router.get("/", async (_req, res) => {
  const ownerUid: string = res.locals.ownerUid;
  const body: ApiResponse<SavedTemplate[]> = { success: true, data: await getTemplates(ownerUid) };
  res.json(body);
});

// POST /api/templates   body: SaveTemplateRequest. Copies one past workflow of this meeting.
router.post("/", hostOnly, async (req, res) => {
  const ownerUid: string = res.locals.ownerUid;
  const body: ApiResponse<SavedTemplate> = { success: true, data: await saveTemplate(ownerUid, req.body) };
  res.status(201).json(body);
});

// POST /api/templates/current   body: SaveCurrentTemplateRequest. Saves the workflow being built.
// The frontend checks the rooms are set; the server only stores what is there.
router.post("/current", hostOnly, async (req, res) => {
  const ownerUid: string = res.locals.ownerUid;
  const snapshot = snapshotWorkflow(res.locals.caller.meetingUUID);
  const body: ApiResponse<SavedTemplate> = { success: true, data: await addTemplate(ownerUid, snapshot) };
  res.status(201).json(body);
});

// DELETE /api/templates/:templateId. Returns the templates left.
router.delete("/:templateId", async (req, res) => {
  const ownerUid: string = res.locals.ownerUid;
  const body: ApiResponse<SavedTemplate[]> = { success: true, data: await deleteTemplate(ownerUid, req.params.templateId) };
  res.json(body);
});

export default router;
