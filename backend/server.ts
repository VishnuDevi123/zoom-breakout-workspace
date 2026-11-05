import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import dotenv from "dotenv";

import roundPlanRoutes from "./routes/round-plans.ts";
import type { ApiResponse, HealthResponse } from "./types/breakout.ts";
import webhookRoutes from "./routes/webhooks.ts";
import liveRoutes from "./routes/live.ts";
import workSpaceRoutes from "./routes/workspace.ts";
import taskRoutes from "./routes/tasks.ts";
import activity_responses_routes from "./routes/activity_responses.ts";
import challengeRoutes from "./routes/challenges.ts";
import templateRoutes from "./routes/templates.ts";
import aiRoutes from "./routes/ai.ts";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 4000;

// Webhooks need the raw bytes to check Zoom's signature, so they parse before express.json().
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  webhookRoutes,
);
app.use(express.json());

app.use(
  helmet({
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    referrerPolicy: {
      policy: "same-origin",
    },
  }),
);

// The router adds /:roundId/rooms. Draft saves never change actual Zoom rooms.
app.use("/api/rounds", roundPlanRoutes);
app.use("/api/live", liveRoutes);
app.use("/api/workspace", workSpaceRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/responses", activity_responses_routes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/ai", aiRoutes);
// zoom OAuth callback route, only backend should handle this
app.get("/auth/callback", (req, res) => {
  res.send("Zoom OAuth callback reached backend.");
});

function health(): ApiResponse<HealthResponse> {
  return {
    success: true,
    data: {
      status: "ok",
      service: "breakout-workspace-backend",
      uptimeSeconds: Math.round(process.uptime()),
    },
  };
}

app.get("/health", (req, res) => {
  res.status(200).json(health());
});

app.get("/api/health", (req, res) => {
  res.status(200).json(health());
});

// Last stop for errors no router handled: a bad JSON body, or a bug. Always the JSON
// envelope, never Express's HTML page with its stack trace.
const handleUnknownError: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  const status = (error as { status?: number }).status;
  if (status === 400 || status === 413) {
    const body: ApiResponse<never> = {
      success: false,
      error: "The request body could not be read.",
    };
    res.status(status).json(body);
    return;
  }
  console.error("Unhandled error:", error);
  const body: ApiResponse<never> = {
    success: false,
    error: "Something went wrong on the server. Try again.",
  };
  res.status(500).json(body);
};
app.use(handleUnknownError);

app.listen(PORT, () => {
  console.log(`Express backend running on port ${PORT}`);
});

