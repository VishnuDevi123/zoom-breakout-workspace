import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import dotenv from "dotenv";
import { applyEvent } from "../store/live.ts";

dotenv.config();
const router = Router();

function hmacHex(message: string): string {
  return createHmac("sha256", process.env.ZOOM_WEBHOOK_SECRET!).update(message).digest("hex");
}

// Zoom signs every request: x-zm-signature = "v0=" + HMAC-SHA256("v0:{timestamp}:{raw body}").
function signedByZoom(rawBody: Buffer, timestamp: string | undefined, signature: string | undefined): boolean {
  if (!timestamp || !signature) return false;
  const expected = Buffer.from(`v0=${hmacHex(`v0:${timestamp}:${rawBody.toString("utf8")}`)}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Mounted with express.raw in server.ts, so req.body is the unparsed Buffer.
router.post("/zoom", (req, res) => {
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!signedByZoom(rawBody, req.get("x-zm-request-timestamp"), req.get("x-zm-signature"))) {
    console.warn("webhook: rejected unsigned request");
    res.sendStatus(401);
    return;
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  if (event.event === "endpoint.url_validation") {
    const plainToken = event.payload.plainToken;
    res.json({ plainToken, encryptedToken: hmacHex(plainToken) });
    return;
  }
  applyEvent(event);
  console.log("webhook:", event.event);
  res.sendStatus(200);
});

export default router;
