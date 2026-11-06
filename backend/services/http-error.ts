/** A refusal the client must see; `server.ts` sends it as the JSON envelope with this status. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty string, returned as sent: ids are opaque, so they are checked but never trimmed. */
export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(`${field} must be a non-empty string.`, 400);
  }
  return value;
}
