import { Router, type ErrorRequestHandler } from "express";

import { AiError, draftWorkflow } from "../services/ai.ts";
import { AppContextError, ownerUidFrom } from "../services/app-context.ts";
import type { ApiResponse, DraftWorkflowResponse } from "../types/breakout.ts";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Host only, like /api/templates: every call spends the OpenAI key, so a request
// without a signed-in Zoom user's X-Zoom-App-Context stops here with 401/403.
router.use((req, _res, next) => {
  ownerUidFrom(req.get("X-Zoom-App-Context"));
  next();
});

// POST /api/ai/workflow   body: DraftWorkflowRequest. Returns a question or a proposal;
// the host applies a proposal with POST /api/workspace/replace.
router.post("/workflow", async (req, res, next) => {
  try {
    const body: ApiResponse<DraftWorkflowResponse> = { success: true, data: await draftWorkflow(req.body) };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

const handleAiError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof AiError || error instanceof AppContextError) {
    const body: ApiResponse<never> = { success: false, error: error.message };
    res.status(error.status).json(body);
    return;
  }
  next(error);
};
router.use(handleAiError);

export default router;
