import { Router } from "express";

import { fixtureSession } from "../fixtures/breakout.ts";
import type { ApiResponse, SessionRecord, SessionState } from "../types/breakout.ts";

const router = Router();

/** Roles the SDK can report. Anything outside this list is not a role. */
const ZOOM_ROLES: SessionRecord["declaredRole"][] = ["host", "coHost", "attendee"];

/**
 * Slice 0 route skeletons for the session record. The declared role is stored
 * as a claim only. Slice 1 onwards must not trust it for anything destructive.
 */

/** Open or fetch the session record for a meeting (slice 1). */
router.post("/", (req, res) => {
  // get parentUUID from either the body or the query, for compatibility with slice 0 and slice 1
  const parentUUID: string | undefined =
    req.body?.parentUUID ?? req.body?.meetingUUID;

  // Slice 1 sends a real meeting UUID. Without one the record would be written
  // against the fixture meeting, which silently mixes two meetings together, so
  // the route refuses instead of guessing.
  if (typeof parentUUID !== "string" || parentUUID.length === 0) {
    const error: ApiResponse<never> = {
      success: false,
      error: "parentUUID is required.",
    };

    res.status(400).json(error);
    return;
  }

  // The role is whatever the client says it is. It is recorded as a claim and
  // must never authorize a destructive operation in a later slice. An unknown
  // value falls back to the least privileged role rather than being trusted.
  const claimed = req.body?.declaredRole;
  const declaredRole: SessionRecord["declaredRole"] = ZOOM_ROLES.includes(claimed)
    ? claimed
    : "attendee";

  const body: ApiResponse<SessionRecord> = {
    success: true,
    data: fixtureSession(parentUUID, declaredRole),
  };

  res.json(body);
});

router.get("/", (req, res) => {
  const parentUUID =
    typeof req.query.parentUUID === "string" ? req.query.parentUUID : undefined;

  const body: ApiResponse<SessionRecord> = {
    success: true,
    data: fixtureSession(parentUUID),
  };

  res.json(body);
});

/** Record an open or close transition with a timestamp (slice 6). */
router.post("/state", (req, res) => {
  const parentUUID: string | undefined = req.body?.parentUUID;
  const nextState: SessionState = req.body?.sessionState ?? "planning";
  const now = new Date().toISOString();

  const session = fixtureSession(parentUUID);

  const body: ApiResponse<SessionRecord> = {
    success: true,
    data: {
      ...session,
      sessionState: nextState,
      updatedAt: now,
      openedAt: nextState === "open" ? now : session.openedAt,
      closedAt: nextState === "closed" ? now : session.closedAt,
    },
  };

  res.json(body);
});

export default router;
