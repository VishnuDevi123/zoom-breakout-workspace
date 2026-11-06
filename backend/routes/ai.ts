import { Router } from "express";

import { draftWorkflow } from "../services/ai.ts";
import { callerFrom } from "../services/app-context.ts";
import { HttpError } from "../services/http-error.ts";
import type { ApiResponse, DraftWorkflowResponse } from "../types/breakout.ts";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Host only: every call spends the OpenAI key. The request names no meeting (nothing
// is saved), so only the token and its role are checked; failures stop here with 401/403.
router.use((req, _res, next) => {
  if (callerFrom(req.get("X-Zoom-App-Context")).role !== "host") {
    throw new HttpError("Only the host can draft with AI.", 403);
  }
  next();
});

// POST /api/ai/workflow   body: DraftWorkflowRequest. Returns a question or a proposal;
// the host applies a proposal with POST /api/workspace/replace.
router.post("/workflow", async (req, res) => {
  const body: ApiResponse<DraftWorkflowResponse> = { success: true, data: await draftWorkflow(req.body) };
  res.json(body);
});

export default router;
