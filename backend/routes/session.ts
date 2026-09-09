import { Router } from "express";

import { fixtureSession } from "../fixtures/breakout.ts";
import type { ApiResponse, SessionRecord, SessionState } from "../types/breakout.ts";

const router = Router();

/**
 * Slice 0 route skeletons for the session record. The declared role is stored
 * as a claim only. Slice 1 onwards must not trust it for anything destructive.
 */

/** Open or fetch the session record for a meeting (slice 1). */
router.post("/", (req, res) => {
  // get parentUUID from either the body or the query, for compatibility with slice 0 and slice 1
  const parentUUID: string | undefined =
    req.body?.parentUUID ?? req.body?.meetingUUID;
  // declaredRole is only used for the fixture
  const declaredRole: SessionRecord["declaredRole"] =
    req.body?.declaredRole ?? "attendee";

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
