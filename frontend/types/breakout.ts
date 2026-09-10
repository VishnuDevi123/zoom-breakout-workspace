/**
 * Shared Week 3 contract types.
 *
 * This file is mirrored by `backend/types/breakout.ts`. Any change here must be
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

/** Default room names, index-aligned with ROOM_DOTS (slice 3). */
export const DEFAULT_ROOM_NAMES = [
  "Table Amber",
  "Table Cobalt",
  "Table Coral",
  "Table Teal",
  "Table Orchid",
  "Table Slate",
] as const;

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

/**
 * Where a participant currently is, from the app's point of view.
 *
 * "assigned" and "in-room" are different facts and must not be merged. Zoom
 * keeps a room assignment after the rooms close, so a person can be assigned to
 * a room while sitting in the main meeting. Collapsing the two would make the
 * app claim somebody is in a room they left.
 */
export type ParticipantStatus =
  | "in-room"
  | "assigned"
  | "unassigned"
  | "joining"
  | "not-joined";

/** Lifecycle of the breakout session itself (slice 6). */
export type SessionState = "planning" | "open" | "closed";

export interface Participant {
  /**
   * Stable identifier across rejoins. Always prefer this over `participantId`,
   * which Zoom re-issues when a person leaves and comes back.
   */
  participantUUID: string;
  /** Zoom's per-meeting id. Present for SDK calls only; never used as a key. */
  participantId?: string;
  displayName: string;
  /** Uppercase initials rendered in the avatar chip. */
  initials: string;
  status: ParticipantStatus;
  /** Internal id of the room the person sits in, or null when unassigned. */
  roomId: string | null;
  isHost: boolean;
}

export interface Room {
  /** Internal stable id, minted by the backend and matched on room name. */
  id: string;
  /** Zoom's own room id. Changes whenever rooms are recreated. */
  zoomRoomId?: string;
  name: string;
  dot: RoomDot;
  participants: Participant[];
  /** Soft delete, so later slices can still reason about history (slice 4). */
  deleted?: boolean;
}

/** One complete read of breakout state at a point in time. */
export interface RoomSnapshot {
  /** UUID of the parent (main) meeting the rooms belong to. */
  parentUUID: string;
  rooms: Room[];
  /** Everybody Zoom has not placed into a room yet. */
  unassigned: Participant[];
  sessionState: SessionState;
  /** ISO 8601 timestamp of when this snapshot was taken. */
  capturedAt: string;
}

export interface SessionRecord {
  parentUUID: string;
  /** Role the client claims. Never trusted for destructive operations. */
  declaredRole: ZoomRole;
  sessionState: SessionState;
  createdAt: string;
  updatedAt: string;
  openedAt?: string;
  closedAt?: string;
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
