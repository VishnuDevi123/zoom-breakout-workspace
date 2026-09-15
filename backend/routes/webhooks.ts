import {Router} from "express";
import { createHmac } from "crypto";
import dotenv from "dotenv";
import {applyEvent} from "../store/live.ts";


dotenv.config();
const router = Router();

router.post("/zoom", (req, res) => {
  if (req.body.event === "endpoint.url_validation") {
    const plainToken = req.body.payload.plainToken;
    const encryptedToken = createHmac(
      "sha256",
      process.env.ZOOM_WEBHOOK_SECRET!,
    )
      .update(plainToken)
      .digest("hex");
    res.json({ plainToken, encryptedToken });
    return;
  }
  applyEvent(req.body);
  console.log("webhook:", req.body.event);
  res.sendStatus(200);
});



export default router;