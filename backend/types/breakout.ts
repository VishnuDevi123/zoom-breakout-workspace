/**
 * Shared Week 3 contract types.
 *
 * This file is mirrored by `frontend/types/breakout.ts`. Any change here must be
 * applied there as well, otherwise the frontend and the backend drift apart.
 */

/** Colour dots used to identify a room. Lifted from the design token palette. */
export const ROOM_DOTS = [
  "#fcb900",
  "#4262ff",
  "#ff9999",
  "#0fbcb0",
  "#e58cc9",
  "#555a6a",
] as const;

export type RoomDot = (typeof ROOM_DOTS)[number];

/**
 * Role reported by zoomSdk.getUserContext(). Values match the SDK literally, so
 * no mapping table can drift. "coHost" carries the same powers as "host" here.
 */
export type ZoomRole = "host" | "coHost" | "attendee";

/**
 * Which screen the app shows.
 * "checking" is the initial state, before getUserContext() resolves.
 * "unsupported" means the client cannot drive breakouts at all, which is a
 * different failure from simply not being a host.
 */
export type HostState = "checking" | "host" | "participant" | "unsupported";

/** Lifecycle of the breakout session itself (slice 6). */
export type SessionState = "planning" | "open" | "closed";

export interface PlannedRoom {
  /** App-owned ID: preserve on rename; generate a new ID when copying a room. */
  id: string;
  name: string;
  dot: RoomDot;
  /** Intended membership, independent of where people currently are in Zoom. */
  participantUUIDs: string[];
}

/** Saved configuration for one round, separate from the live RoomSnapshot. */
export interface RoundPlan {
  parentUUID: string;
  roundId: string;
  title: string;
  /** Server-owned version: first save is 1; each successful update adds 1. */
  revision: number;
  rooms: PlannedRoom[];
  /** People deliberately left in the main meeting, not unresolved placements. */
  stayInMainParticipantUUIDs: string[];
}

export type RoundPlanDraft = Omit<RoundPlan, "revision">;

/** PUT body. Use 0 to create; otherwise send the last read/saved revision. */
export interface SaveRoundPlanRequest extends RoundPlanDraft {
  expectedRevision: number;
}

export interface SessionRecord {
  parentUUID: string;
  /** Role the client claims. Never trusted for destructive operations. */
  declaredRole: ZoomRole;
  createdAt: string;
}

/** Envelope every Week 3 route answers with. */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface HealthResponse {
  status: "ok";
  service: string;
  uptimeSeconds: number;
}


export interface LiveParticipant {
  participantUUID: string;
  name: string;
  location: "main" | "left"| string;
}
 

export interface LiveRound {
  roundId: string;
  roomUUIDs: Record<string, string | null>;
}

export interface LiveState {
  parentUUID: string;
  round: LiveRound | null;
  participants: LiveParticipant[];
}
