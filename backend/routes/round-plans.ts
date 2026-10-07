import { Router, type ErrorRequestHandler } from "express";

import { carryPlacement, getRoundPlan, RoundPlanError, saveRoundPlan } from "../store/round-plans.ts";
import { getWorkspace } from "../store/workspace.ts";
import type { ApiResponse, CarryPlacementRequest, RoundPlan, SaveRoundPlanRequest } from "../types/breakout.ts";

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

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// POST /api/rounds/round-2/carry: someone placed mid-round in round-2 also goes
// into the same-named room of every later round that has not run yet.
router.post("/:roundId/carry", (req, res) => {
  const request = (req.body ?? {}) as Partial<CarryPlacementRequest>;
  const parentUUID = nonEmptyString(request.parentUUID);
  const participantUUID = nonEmptyString(request.participantUUID);
  const roomName = nonEmptyString(request.roomName);
  if (!parentUUID || !participantUUID || !roomName || request.roundId !== req.params.roundId) {
    throw new RoundPlanError(
      "parentUUID, participantUUID, roomName and a roundId matching the URL are required.",
      400,
    );
  }

  // Later rounds in workspace order; a round that ran or is running keeps its plan.
  const rounds = getWorkspace(parentUUID)?.rounds ?? [];
  const from = rounds.findIndex((round) => round.roundId === req.params.roundId);
  // An unknown round has no "later"; carrying into every round would be wrong.
  const laterRoundIds = (from < 0 ? [] : rounds.slice(from + 1))
    .filter((round) => round.status === "planned" || round.status === "skipped")
    .map((round) => round.roundId);

  const updatedRoundIds = carryPlacement(parentUUID, laterRoundIds, participantUUID, roomName);
  const body: ApiResponse<{ updatedRoundIds: string[] }> = { success: true, data: { updatedRoundIds } };
  res.json(body);
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
