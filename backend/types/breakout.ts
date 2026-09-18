/**
 * Shared contract types.
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

export interface PlannedRoom {
  id: string;
  name: string;
  dot: RoomDot;
  participantUUIDs: string[];
}

/** Saved configuration for one round, separate from live Zoom state. */
export interface RoundPlan {
  parentUUID: string;
  roundId: string;
  title: string;
  revision: number;
  rooms: PlannedRoom[];
  stayInMainParticipantUUIDs: string[];
}

export type RoundPlanDraft = Omit<RoundPlan, "revision">;


export interface SaveRoundPlanRequest extends RoundPlanDraft {
  expectedRevision: number;
}


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
  isHost: boolean;
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

export type RoundStatus = "planned" | "launched" | "closed";

/** Per-round metadata. Room lists live in RoundPlan, keyed by the same roundId. */
export interface RoundMeta {
  roundId: string;
  title: string | null;
  durationSec: number;
  /** Server-owned: assigned on add, never by PUT. */
  dot: RoomDot;
  /** Server-owned: set by /api/live/launch and /close, never by PUT. */
  status: RoundStatus;
}

/** One record per meeting. Order of `rounds` is display order. */
export interface Workspace {
  parentUUID: string;
  title: string;
  sameRoomsEveryRound: boolean;
  rounds: RoundMeta[];
  /** Server-owned version: first save is 1; each successful update adds 1. */
  revision: number;
}

/** PUT body. Use 0 to create. Round set must match stored roundIds; add/remove via /rounds. */
export interface SaveWorkspaceRequest {
  parentUUID: string;
  title: string;
  sameRoomsEveryRound: boolean;
  rounds: Omit<RoundMeta, "status" | "dot">[];
  expectedRevision: number;
}

/** POST /api/workspace/rounds body. Server assigns roundId, dot, status. */
export interface AddRoundRequest {
  parentUUID: string;
  title?: string;
  durationSec?: number;
}
