import express from "express";
import cors from "cors";
import dotenv from "dotenv";
// import { router } from "./routes";


dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
app.get("/api/test", (req, res) => {
  res.json({
    message: "Express backend connected",
  });
});

app.get("/auth/callback", (req, res) => {
  console.log("Auth callback received");
  console.log("Code:", req.query.code);

  res.send("Zoom OAuth callback reached Express successfully.");
});