import { Router } from "express";

import { getSession, openSession } from "../store/session.ts";
import type { ApiResponse, SessionRecord, ZoomRole } from "../types/breakout.ts";

const router = Router();
const ZOOM_ROLES: ZoomRole[] = ["host", "coHost", "attendee"];

function requiredParentUUID(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

router.post("/", (req, res) => {
  const parentUUID = requiredParentUUID(req.body?.parentUUID ?? req.body?.meetingUUID);
  if (!parentUUID) {
    const body: ApiResponse<never> = { success: false, error: "parentUUID is required." };
    res.status(400).json(body);
    return;
  }

  const claimed = req.body?.declaredRole;
  const declaredRole: ZoomRole = ZOOM_ROLES.includes(claimed) ? claimed : "attendee";
  const body: ApiResponse<SessionRecord> = {
    success: true,
    data: openSession(parentUUID, declaredRole),
  };
  res.json(body);
});

router.get("/", (req, res) => {
  const parentUUID = requiredParentUUID(req.query.parentUUID);
  if (!parentUUID) {
    const body: ApiResponse<never> = { success: false, error: "parentUUID is required." };
    res.status(400).json(body);
    return;
  }
  const session = getSession(parentUUID);
  if (!session) {
    const body: ApiResponse<never> = { success: false, error: "Session not found." };
    res.status(404).json(body);
    return;
  }
  const body: ApiResponse<SessionRecord> = { success: true, data: session };
  res.json(body);
});

export default router;
