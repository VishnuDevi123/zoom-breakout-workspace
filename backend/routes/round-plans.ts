import { Router, type ErrorRequestHandler } from "express";

import { getRoundPlan, RoundPlanError, saveRoundPlan } from "../store/round-plans.ts";
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
router.get("/:roundId/rooms", (req, res) => {
  // Query/URL parameters choose which draft to read. The meeting ID is a storage
  // key, not proof of authorization; session authentication remains separate.
  const plan = getRoundPlan(req.query.parentUUID, req.params.roundId);
  if (!plan) {
    const body: ApiResponse<never> = { success: false, error: "No saved draft for this round." };
    res.status(404).json(body);
    return;
  }

  const body: ApiResponse<RoundPlan> = { success: true, data: plan };
  res.json(body);
});

// PUT replaces the selected draft, not Zoom rooms. A new draft uses
// expectedRevision: 0; updates use the revision returned by the last GET/PUT.
router.put("/:roundId/rooms", (req, res) => {
  // A TypeScript interface does not validate network JSON. Check the outer
  // object here, then let the store validate every field before writing.
  const input: unknown = req.body;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new RoundPlanError("The request body must be an object.", 400);
  }
  const request = input as Partial<SaveRoundPlanRequest>;
  if (request.roundId !== req.params.roundId) {
    throw new RoundPlanError("Body roundId must match the URL roundId.", 400);
  }

  const saved = saveRoundPlan(request, request.expectedRevision);
  const body: ApiResponse<RoundPlan> = { success: true, data: saved };
  res.status(saved.revision === 1 ? 201 : 200).json(body);
});

// Express catches synchronous throws from the handlers above. Return the same
// JSON envelope for validation/conflicts that the frontend uses for successes.
const handlePlanError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof RoundPlanError) {
    const body: ApiResponse<never> = { success: false, error: error.message };
    res.status(error.status).json(body);
    return;
  }
  next(error);
};
router.use(handlePlanError);

export default router;
