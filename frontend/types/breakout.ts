/**
 * Shared contract types.
 *
 * This file is mirrored by `frontend/types/breakout.ts`. Any change here must be
 * applied there as well, otherwise the frontend and the backend drift apart.
 */

/** Colour dots used to identify a room. Lifted from the design token palette. */
/** Most rooms one round can plan. Store, AI schema and editor all use it. */
export const MAX_ROOMS = 20;

export const ROOM_DOTS = [
  "#fcb900",
  "#4262ff",
  "#ff9999",
  "#0fbcb0",
  "#e58cc9",
  "#555a6a",
  "#f5a623",
  "#7ed321",
  "#a4c484",
  "#9f2929",
  "#60d024",
  "#4e3103",
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

/** Meeting role from webhooks and the roster. Host and co-hosts run the host app and are never placed in rooms. */
export type MeetingRole = "host" | "coHost" | "attendee";

export interface LiveParticipant {
  participantUUID: string;
  name: string;
  role: MeetingRole;
  location: "main" | "left" | string;
}

/** How a room tells the host it is doing. "onTrack" is the default and is never stored. */
export type RoomStatus = "onTrack" | "moreTime" | "done";

export interface LiveRound {
  roundId: string;
  roomUUIDs: Record<string, string | null>;
  endsAt: number;
  timerEnded: boolean;
  /** Planned room id -> the room's latest signal. A missing room is on track. Starts empty every launch. */
  roomStatus: Record<string, Exclude<RoomStatus, "onTrack">>;
}

export interface LiveState {
  parentUUID: string;
  round: LiveRound | null;
  participants: LiveParticipant[];
  /** Bumped on every task save; participants refetch /api/tasks when it changes. */
  taskRevision: number;
  /** roomId -> counter, bumped on every response write in that room. Clients refetch their own room only. */
  roomRevisions: Record<string, number>;
  /** Bumped when the host launches or reveals a poll or quiz; every client refetches /api/challenges. */
  challengeRevision: number;
}

/** One person the Zoom SDK reports present when the host opens the app. */
export interface RosterEntry {
  participantUUID: string;
  name: string;
  role: MeetingRole;
  /** Planned room id when Zoom reports the person inside a room; null for the main room. */
  roomId: string | null;
}

/** POST /api/live/room-status. Anyone the plan places in the room; the latest tap wins. */
export interface SetRoomStatusRequest {
  parentUUID: string;
  roundId: string;
  roomId: string;
  participantUUID: string;
  status: RoomStatus;
}

/** Everyone in the meeting right now. Webhooks never replay, so this fills what they missed. */
export interface RosterRequest {
  parentUUID: string;
  participants: RosterEntry[];
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

/** A past workflow the host chose to keep. Owned by the Zoom user (`uid` from the app context), the same in every meeting. */
export interface SavedTemplate extends WorkflowSnapshot {
  id: string;
  ownerUid: string;
  savedAt: string;
  /** The past workflow it was saved from, so each is saved once. Absent when saved from the workflow being built. */
  sourcePastWorkflowId?: string;
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

/** One turn of the AI builder chat. An assistant turn is the AI's question or a short note about its proposal. */
export interface AiChatMessage {
  role: "host" | "assistant";
  text: string;
}

/** POST /api/ai/workflow. `messages` is the chat so far, oldest first, ending with the host's turn. `draft` is the AI's last proposal when the host refines it, null for a new one. */
export interface DraftWorkflowRequest {
  messages: AiChatMessage[];
  draft: WorkflowSnapshot | null;
}

/** The AI asks for missing details, or proposes a workflow. Nothing is saved: the host applies a proposal with POST /api/workspace/replace. */
export type DraftWorkflowResponse =
  | { kind: "question"; question: string }
  | { kind: "workflow"; workflow: WorkflowSnapshot };

/** POST /api/templates */
export interface SaveTemplateRequest {
  parentUUID: string;
  pastWorkflowId: string;
}

/** POST /api/templates/current: the workflow being built, without people. */
export interface SaveCurrentTemplateRequest {
  parentUUID: string;
}

// ---- Responses: participant-written, one record per (parentUUID, roundId, roomId) ----

export const NOTE_COLORS = [
  "#fccf0687",
  "#06ead7",
  "#eef1ff",
  "#e3f7d4",
  "#ff9999",
  "#0fbcb0",
  "#e58cc9",
  "#7ed321",
  "#a4c484",
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

export interface RoomResponses {
  parentUUID: string;
  roundId: string;
  roomId: string;
  /** activityId -> participantUUID -> answer. GET returns only the caller's own. */
  answers: Record<string, Record<string, IndividualAnswer>>;
  /** activityId -> notes, oldest first. */
  ideas: Record<string, IdeaNote[]>;
  /** Task checklist itemId -> true when ticked; a missing item means unticked. Who ticked is not kept: no screen shows it. */
  ticks: Record<string, true>;
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

// ---- Live polls and quizzes: the host launches one during a running round; each room answers as one ----

/** Most questions one quiz holds. A poll always has exactly one. */
export const MAX_QUIZ_QUESTIONS = 10;
/** Each question offers 2 to this many options. */
export const MAX_CHALLENGE_OPTIONS = 4;

export interface ChallengeQuestion {
  text: string;
  options: string[];
}

interface ChallengeFields {
  title: string;
  questions: ChallengeQuestion[];
  durationSec: number;
}

/** What the host writes before launching. A poll has one question and no right answer. */
export type ChallengeDraft =
  | (ChallengeFields & { kind: "poll" })
  | (ChallengeFields & {
      kind: "quiz";
      /** The right option index for each question, by position. */
      answerKey: number[];
    });

/** One room's work on a challenge. Arrays run by question position. */
export interface RoomChallengeAnswers {
  /** participantUUID -> the option they lean to. Shared with the room as suggestions, never final. */
  picks: Record<string, number>[];
  /** The room's final answer per question; null until someone in the room locks one in. */
  locks: (RoomLock | null)[];
}

export interface RoomLock {
  option: number;
  participantUUID: string;
  /** Server time of the lock. */
  at: number;
}

/** How one room did, for the host and, once revealed, for every room. */
export interface RoomChallengeResult {
  roomId: string;
  name: string;
  dot: RoomDot;
  /** The locked option per question; null when the room left it open. */
  answers: (number | null)[];
  /** Quiz: questions answered right. Poll: 0. */
  correct: number;
  /** Server time the room locked its last question; null while any is open. */
  finishedAt: number | null;
}

export interface ChallengeResults {
  /** Quiz only; null for a poll. */
  answerKey: number[] | null;
  /** Every planned room. A quiz ranks most right first, then the earliest finish; a poll keeps plan order. */
  rooms: RoomChallengeResult[];
}

/** One launched poll or quiz, as a client sees it. */
export interface ChallengeView {
  id: string;
  kind: ChallengeDraft["kind"];
  title: string;
  questions: ChallengeQuestion[];
  /** Server times. Locks after endsAt are refused. */
  launchedAt: number;
  endsAt: number;
  revealed: boolean;
  /** The caller's room: picks and locks. Null in the host's view. */
  room: RoomChallengeAnswers | null;
  /** The host always gets these; a participant only after the host reveals. */
  results: ChallengeResults | null;
}

/** POST /api/challenges/:roundId. Only while the round runs, and only when no earlier one waits for its reveal. */
export interface LaunchChallengeRequest {
  parentUUID: string;
  draft: ChallengeDraft;
}

/** PUT .../picks/:question (a suggestion) and POST .../locks/:question (the room's answer). */
export interface ChallengeAnswerRequest extends ResponseCaller {
  option: number;
}

/** POST /api/challenges/:roundId/:challengeId/reveal */
export interface RevealChallengeRequest {
  parentUUID: string;
}
