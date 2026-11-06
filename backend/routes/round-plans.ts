import { Router } from "express";
import { anyoneInMeeting, hostOrCoHost } from "../services/app-context.ts";
import { HttpError, isRecord } from "../services/http-error.ts";

import { getRoundPlan, saveRoundPlan } from "../store/round-plans.ts";
import type { ApiResponse, RoundPlan, SaveRoundPlanRequest } from "../types/breakout.ts";

// Router is the named Express export. The default export creates an entire app.
const router = Router();

// Drafts change frequently; a browser must not reuse an old cached revision.
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// server.ts mounts this router at /api/rounds:
// GET /api/rounds/round-1/rooms?parentUUID=<meeting ID>
router.get("/:roundId/rooms", anyoneInMeeting, (req, res) => {
  const plan = getRoundPlan(res.locals.caller.meetingUUID, req.params.roundId);
  if (!plan) throw new HttpError("No saved draft for this round.", 404);

  const body: ApiResponse<RoundPlan> = { success: true, data: plan };
  res.json(body);
});

// PUT replaces the selected draft, not Zoom rooms. A new draft uses
// expectedRevision: 0; updates use the revision returned by the last GET/PUT.
router.put("/:roundId/rooms", hostOrCoHost, (req, res) => {
  // Check the outer object here; the store validates every field before writing.
  if (!isRecord(req.body)) throw new HttpError("The request body must be an object.", 400);
  const request = req.body as Partial<SaveRoundPlanRequest>;
  if (request.roundId !== req.params.roundId) {
    throw new HttpError("Body roundId must match the URL roundId.", 400);
  }

  const saved = saveRoundPlan(request, request.expectedRevision);
  const body: ApiResponse<RoundPlan> = { success: true, data: saved };
  res.status(saved.revision === 1 ? 201 : 200).json(body);
});

export default router;
