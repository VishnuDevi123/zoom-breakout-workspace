import express from "express";
import helmet from "helmet";
import dotenv from "dotenv";

import testRoutes from "./routes/tests.ts";
import roomRoutes from "./routes/rooms.ts";
import sessionRoutes from "./routes/session.ts";
import roundPlanRoutes from "./routes/round-plans.ts";
import type { ApiResponse, HealthResponse } from "./types/breakout.ts";
import webhookRoutes from "./routes/webhooks.ts";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 4000;

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

app.use("/api/test", testRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/rooms", roomRoutes);
// The router adds /:roundId/rooms. Draft saves never change actual Zoom rooms.
app.use("/api/rounds", roundPlanRoutes);
app.use("/api/webhooks", webhookRoutes);
// zoom OAuth callback route, only backend should handle this
app.get("/auth/callback", (req, res) => {
  console.log("Auth callback received");
  console.log("Code:", req.query.code);

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

app.listen(PORT, () => {
  console.log(`Express backend running on port ${PORT}`);
});
