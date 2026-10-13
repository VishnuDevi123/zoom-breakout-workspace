import crypto from "node:crypto";

/** 401: no token, unreadable or expired. 403: a guest (no Zoom account, so no uid). */
export class AppContextError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AppContextError";
  }
}

/** The decrypted X-Zoom-App-Context payload; only the fields we use are typed. */
interface AppContext {
  /** Zoom user id; absent for guests, who get `iid` instead. */
  uid?: string;
  iid?: string;
  exp: number;
  ts: number;
  typ: string;
}

/**
 * Decrypts the token from `getAppContext()` / the X-Zoom-App-Context header.
 * Layout and algorithm from Zoom's docs (developers.zoom.us/docs/zoom-apps/zoom-app-context):
 * AES-256-GCM with key = sha256(client secret).
 */
function decryptAppContext(token: string): AppContext {
  // Read here, not at import: server.ts loads .env after its imports have run.
  const secret = process.env.ZOOM_CLIENT_SECRET;
  if (!secret) throw new Error("ZOOM_CLIENT_SECRET is not set.");

  try {
    const buf = Buffer.from(token, "base64");
    const ivLength = buf.readUInt8(0);
    const iv = buf.subarray(1, 1 + ivLength);
    const aadLength = buf.readUInt16LE(1 + ivLength);
    const aadStart = 3 + ivLength;
    const aad = buf.subarray(aadStart, aadStart + aadLength);
    const cipherLength = buf.readUInt32LE(aadStart + aadLength);
    const cipherStart = aadStart + aadLength + 4;
    const cipherText = buf.subarray(cipherStart, cipherStart + cipherLength);
    const tag = buf.subarray(cipherStart + cipherLength);

    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
    return JSON.parse(json) as AppContext;
  } catch {
    // A wrong secret, a cut token or a tampered one all fail the GCM tag check here.
    throw new AppContextError("Zoom app context could not be read.", 401);
  }
}

/** The template owner for one request: decrypt, check exp, require uid. */
export function ownerUidFrom(header: string | undefined): string {
  if (!header) throw new AppContextError("Missing Zoom app context.", 401);

  const context = decryptAppContext(header);
  // Without a numeric exp the check below would compare NaN and let the token through.
  if (typeof context.exp !== "number") throw new AppContextError("Zoom app context has no expiry.", 401);
  // Zoom documents exp only as a "long": treat 10-digit values as seconds, 13-digit as milliseconds.
  const expiresAtMs = context.exp < 1e12 ? context.exp * 1000 : context.exp;
  if (expiresAtMs <= Date.now()) throw new AppContextError("Zoom app context expired.", 401);
  if (!context.uid) throw new AppContextError("Sign in to Zoom to save templates.", 403);

  return context.uid;
}
