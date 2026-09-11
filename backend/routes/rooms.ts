import { Router } from "express";

import { fixtureSnapshot } from "../fixtures/breakout.ts";
import {
  readSnapshot,
  recordIntendedCreationNames,
  saveSnapshot,
} from "../store/snapshots.ts";
import type { ApiResponse, RoomSnapshot } from "../types/breakout.ts";

const router = Router();

/**
 * Slice 0 route skeletons. Every handler answers with the same fixture shape it
 * will answer with once real state lands, so the frontend can be written now.
 */

/** Last stored breakout state for a meeting (slice 2). */
router.get("/snapshot", (req, res) => {
  const parentUUID = req.query.parentUUID;

  if (typeof parentUUID !== "string" || parentUUID.length === 0) {
    const error: ApiResponse<never> = {
      success: false,
      error: "parentUUID is required.",
    };

    res.status(400).json(error);
    return;
  }

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: readSnapshot(parentUUID),
  };

  res.json(body);
});

/**
 * Accept a normalized snapshot read from the Zoom client (slice 2, slice 7).
 *
 * The response carries observation ids scoped to the current native room set.
 * Draft room ids remain separate and Slice 6 will map them during application.
 */
router.post("/snapshot", (req, res) => {
  const incoming = req.body as Partial<RoomSnapshot> | undefined;

  if (typeof incoming?.parentUUID !== "string" || incoming.parentUUID.length === 0) {
    const error: ApiResponse<never> = {
      success: false,
      error: "parentUUID is required.",
    };

    res.status(400).json(error);
    return;
  }

  if (!Array.isArray(incoming.rooms) || !Array.isArray(incoming.unassigned)) {
    const error: ApiResponse<never> = {
      success: false,
      error: "rooms and unassigned must both be arrays.",
    };

    res.status(400).json(error);
    return;
  }

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: saveSnapshot({
      parentUUID: incoming.parentUUID,
      rooms: incoming.rooms,
      unassigned: incoming.unassigned,
      sessionState: incoming.sessionState ?? "planning",
      capturedAt: incoming.capturedAt ?? new Date().toISOString(),
    }),
  };

  res.json(body);
});

/**
 * Record names used by the Slice 3 execution adapter. This metadata never
 * replaces the live snapshot and never acts as a round draft.
 */
router.post("/", (req, res) => {
  const incoming = req.body as { parentUUID?: unknown; names?: unknown } | undefined;

  if (typeof incoming?.parentUUID !== "string" || incoming.parentUUID.length === 0) {
    const error: ApiResponse<never> = {
      success: false,
      error: "parentUUID is required.",
    };

    res.status(400).json(error);
    return;
  }

  const names = incoming.names;

  if (!Array.isArray(names) || names.length === 0) {
    const error: ApiResponse<never> = {
      success: false,
      error: "names must be a non-empty array.",
    };

    res.status(400).json(error);
    return;
  }

  const cleaned = names.map((name) => (typeof name === "string" ? name.trim() : ""));

  if (cleaned.some((name) => name.length === 0)) {
    const error: ApiResponse<never> = {
      success: false,
      error: "Every room name must be a non-empty string.",
    };

    res.status(400).json(error);
    return;
  }

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: recordIntendedCreationNames(incoming.parentUUID, cleaned),
  };

  res.status(201).json(body);
});

/** Record assignment intent per stable room id (slice 5). */
router.post("/assignments", (req, res) => {
  const parentUUID: string | undefined = req.body?.parentUUID;

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: fixtureSnapshot(parentUUID),
  };

  res.json(body);
});

export default router;
