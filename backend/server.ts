import express from "express";
import helmet from "helmet";
import dotenv from "dotenv";

import testRoutes from "./routes/tests.ts";

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
app.use("/api", testRoutes);

// zoom OAuth callback route, only backend should handle this
app.get("/auth/callback", (req, res) => {
  console.log("Auth callback received");
  console.log("Code:", req.query.code);

  res.send("Zoom OAuth callback reached backend.");
});



app.listen(PORT, () => {
  console.log(`Express backend running on port ${PORT}`);
});
