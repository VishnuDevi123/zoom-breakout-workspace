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
  location: "main" | "left" | string;
}

export interface LiveRound {
  roundId: string;
  roomUUIDs: Record<string, string | null>;
  endsAt: number;
  timerEnded: boolean;
}

export interface LiveState {
  parentUUID: string;
  round: LiveRound | null;
  participants: LiveParticipant[];
  /** Bumped on every task save; participants refetch /api/tasks when it changes. */
  taskRevision: number;
  /** roomId -> counter, bumped on every response write in that room. Clients refetch their own room only. */
  roomRevisions: Record<string, number>;
}

/** One person the Zoom SDK reports present when the host opens the app. */
export interface RosterEntry {
  participantUUID: string;
  name: string;
  isHost: boolean;
  /** Planned room id when Zoom reports the person inside a room; null for the main room. */
  roomId: string | null;
}

/** Everyone in the meeting right now. Webhooks never replay, so this fills what they missed. */
export interface RosterRequest {
  parentUUID: string;
  participants: RosterEntry[];
}

/** Carry a mid-round placement into the later rounds that have not run. */
export interface CarryPlacementRequest {
  parentUUID: string;
  /** The running round the person was just placed in; only rounds after it change. */
  roundId: string;
  participantUUID: string;
  /** Matched by name in each later round, since every round has its own room ids. */
  roomName: string;
}

export type RoundStatus = "planned" | "launched" | "closed" | "skipped";

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
  samePeopleEveryRound: boolean;
  autoStartNextRound: boolean;
}

/** PUT body. Use 0 to create. Round set must match stored roundIds; add/remove via /rounds. */
export interface SaveWorkspaceRequest {
  parentUUID: string;
  title: string;
  sameRoomsEveryRound: boolean;
  rounds: Omit<RoundMeta, "status" | "dot">[];
  expectedRevision: number;
  samePeopleEveryRound: boolean;
  autoStartNextRound: boolean;
}

/** POST /api/workspace/rounds body. Server assigns roundId, dot, status. */
export interface AddRoundRequest {
  parentUUID: string;
  title?: string;
  durationSec?: number;
}
/** What one room sees during a round. Resources are URLs. */
export interface RoomTask {
  goal: string;
  instructions: string[];
  resources: string[];
  /** Shared done-list for the room; anyone in the room ticks items. */
  checklist: CheckListItem[];
}

/** One record per (parentUUID, roundId). `rooms` overrides `all`, keyed by PlannedRoom.id. */
export interface RoundTasks {
  parentUUID: string;
  roundId: string;
  all: RoomTask | null;
  rooms: Record<string, RoomTask>;
  /** Server-owned version: first save is 1; each successful update adds 1. */
  revision: number;
  // round wide, empty array means missing actvities
  activities: Activity[];
}

/** PUT body. Use 0 to create. */
export interface SaveRoundTasksRequest extends Omit<RoundTasks, "revision"> {
  expectedRevision: number;
}

export interface LiveActionResponse {
  live: LiveState;
  /** Null when this meeting has no workspace; launch never gates on one. */
  workspace: Workspace | null;
}

// Host written activity interface
export interface IndividualActivity {
  kind: "individual";
  id: string;
  title: string;
  /** Host's extra info: a clue or a longer description of the question. */
  description: string;
}

export interface IdeaBoardActivity {
  kind: "ideaBoard";
  id: string;
  title: string;
  description: string;
}

export interface CheckListItem {
  id: string;
  label: string;
}

export type Activity = IndividualActivity | IdeaBoardActivity;

// ---- Workflows without people: what End Workflow keeps and a template restores ----

/** One round as a template: room names only, no room ids, people or submissions. */
export interface WorkflowRoundSnapshot {
  title: string | null;
  durationSec: number;
  roomNames: string[];
  task: RoomTask | null;
  activities: Activity[];
}

export interface WorkflowSnapshot {
  title: string;
  sameRoomsEveryRound: boolean;
  samePeopleEveryRound: boolean;
  autoStartNextRound: boolean;
  rounds: WorkflowRoundSnapshot[];
}

/** A workflow the host ended in this meeting. */
export interface PastWorkflow extends WorkflowSnapshot {
  id: string;
  /** ISO time of End Workflow. */
  endedAt: string;
}

/** A past workflow the host chose to keep. Keyed by the host's participantUUID until persistence. */
export interface SavedTemplate extends WorkflowSnapshot {
  id: string;
  hostUUID: string;
  savedAt: string;
}

/** POST /api/workspace/end. The frontend closes any open round first. */
export interface EndWorkflowRequest {
  parentUUID: string;
  expectedRevision: number;
}

/** POST /api/workspace/replace. Use expectedRevision 0 when the meeting has no workflow. */
export interface ReplaceWorkflowRequest {
  parentUUID: string;
  expectedRevision: number;
  snapshot: WorkflowSnapshot;
}

/** POST /api/templates */
export interface SaveTemplateRequest {
  parentUUID: string;
  pastWorkflowId: string;
  hostUUID: string;
}

/** POST /api/templates/current: the workflow being built, without people. */
export interface SaveCurrentTemplateRequest {
  parentUUID: string;
  hostUUID: string;
}

// ---- Responses: participant-written, one record per (parentUUID, roundId, roomId) ----

export const NOTE_COLORS = [
  "#fff4c4",
  "#c3faf5",
  "#fde0f0",
  "#eef1ff",
  "#e3f7d4",
] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** "working" = draft autosaved; "submitted" = sent to host. No entry = not started. */
export type AnswerStatus = "working" | "submitted";

/** One person's private answer to an individual activity. Editing after submit sets it back to "working". */
export interface IndividualAnswer {
  participantUUID: string;
  text: string;
  status: AnswerStatus;
}

/** A sticky note on an idea board. Only its author may edit or remove it. */
export interface IdeaNote {
  id: string;
  participantUUID: string;
  authorName: string;
  /** Server sets "Idea N" on create; the author renames it. */
  title: string;
  description: string;
  /** Server-owned: picked on create, never changed by edits. */
  color: NoteColor;
}

export interface ChecklistTick {
  participantUUID: string;
  authorName: string;
}

export interface RoomResponses {
  parentUUID: string;
  roundId: string;
  roomId: string;
  /** activityId -> participantUUID -> answer. GET returns only the caller's own. */
  answers: Record<string, Record<string, IndividualAnswer>>;
  /** activityId -> notes, oldest first. */
  ideas: Record<string, IdeaNote[]>;
  /** Task checklist itemId -> who ticked it. A missing item means unticked. */
  ticks: Record<string, ChecklistTick>;
  /** activityId -> last "Idea N" number handed out. Never goes down. */
  ideaCounters: Record<string, number>;
}

/** What GET and every write return to one participant. Others' answer text is never included. */
export interface RoomResponsesView extends Omit<RoomResponses, "answers" | "ideaCounters"> {
  /** activityId -> the caller's own answer (draft or submitted). */
  myAnswers: Record<string, IndividualAnswer>;
  /** activityId -> participantUUID -> status, for the room's submission list. */
  statuses: Record<string, Record<string, AnswerStatus>>;
}
/** The host's view of one room: every answer (text only once submitted), every note and tick. */
export type RoomResponsesHostView = Omit<RoomResponses, "ideaCounters">;
// ---- Request bodies. parentUUID and participantUUID identify the caller. ----

interface ResponseCaller {
  parentUUID: string;
  participantUUID: string;
}

/** PUT .../answers/:activityId. Autosave sends "working"; "Submit to host" sends "submitted". */
export interface SaveAnswerRequest extends ResponseCaller {
  text: string;
  status: AnswerStatus;
}

/** POST .../ideas/:activityId. The server fills in id, author, title and color. */
export interface AddIdeaRequest extends ResponseCaller {
  description: string;
}

/** PUT .../ideas/:activityId/:noteId. Author only. */
export interface EditIdeaRequest extends ResponseCaller {
  title: string;
  description: string;
}

/** DELETE .../ideas/:activityId/:noteId. Author only. */
export type RemoveIdeaRequest = ResponseCaller;

/** PUT .../ticks/:itemId */
export interface TickRequest extends ResponseCaller {
  done: boolean;
}

