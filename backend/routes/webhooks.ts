import {Router} from "express";
import { createHmac } from "crypto";
import dotenv from "dotenv";

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
  console.log("webhook:", req.body.event);
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});



export default router;