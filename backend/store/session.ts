import type { SessionRecord, ZoomRole } from "../types/breakout.ts";

/** Role each app client declared for a meeting. Informational only; never authorization. */
const sessions = new Map<string, SessionRecord>();

export function openSession(parentUUID: string, declaredRole: ZoomRole): SessionRecord {
  const record: SessionRecord = { parentUUID, declaredRole, createdAt: new Date().toISOString() };
  sessions.set(parentUUID, record);
  return record;
}

export function getSession(parentUUID: string): SessionRecord | undefined {
  return sessions.get(parentUUID);
}
