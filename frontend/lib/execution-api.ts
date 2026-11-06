import type {
  AddIdeaRequest,
  DraftWorkflowRequest,
  DraftWorkflowResponse,
  ApiResponse,
  ChallengeAnswerRequest,
  ChallengeDraft,
  ChallengeView,
  EditIdeaRequest,
  LiveActionResponse,
  LiveState,
  PastWorkflow,
  RoundPlan,
  RemoveIdeaRequest,
  RoomResponsesHostView,
  RoomResponsesView,
  RoomLink,
  RosterEntry,
  RoundPlanDraft,
  RoundTasks,
  SaveRoundPlanRequest,
  SaveAnswerRequest,
  SaveRoundTasksRequest,
  SavedTemplate,
  SaveCurrentTemplateRequest,
  SetRoomStatusRequest,
  SaveTemplateRequest,
  TickRequest,
  Workspace,
} from "@/types/breakout";
import { forgetAppContextToken, readAppContextToken } from "@/lib/zoom-sdk";

/** Carries the HTTP status so a caller can tell a 409 conflict from other failures. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Every backend call goes through here: it adds this user's app context token,
 * which the backend checks for meeting and role. A 401 means the token expired
 * or was replaced, so it is read again and the request repeated once (the one
 * retry the user approved, 2026-11-04).
 */
// The backend's own address when the frontend is hosted elsewhere: Amplify's rewrite holds a
// response until it ends, so the SSE stream never arrives through it.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = async () => {
    const headers = new Headers(init.headers);
    headers.set("X-Zoom-App-Context", await readAppContextToken());
    return fetch(BACKEND_URL + url, { ...init, headers });
  };
  const response = await send();
  if (response.status !== 401) return response;
  forgetAppContextToken();
  return send();
}

async function apiResult<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !result.success) {
    throw new ApiError(
      result.success ? `Backend returned ${response.status}.` : result.error,
      response.status,
    );
  }
  return result.data;
}

export async function readSavedRoundPlan(
  parentUUID: string,
  roundId: string,
): Promise<RoundPlan> {
  return apiResult(
    await apiFetch(
      `/api/rounds/${encodeURIComponent(roundId)}/rooms?parentUUID=${encodeURIComponent(parentUUID)}`,
      { cache: "no-store" },
    ),
  );
}

/**
 * Read-only workspace fetch. `use-workspace` owns the host's copy, with its
 * edits and revision; a participant only needs a round's position in the list.
 * Null when no workspace exists for this meeting yet.
 */
export async function readWorkspace(parentUUID: string): Promise<Workspace | null> {
  const response = await apiFetch(`/api/workspace?parentUUID=${encodeURIComponent(parentUUID)}`, {
    cache: "no-store",
  });
  if (response.status === 404) return null;
  return apiResult(response);
}

/** Null when the host has not written a task for this round yet (backend 404). */
export async function readRoundTasks(
  parentUUID: string,
  roundId: string,
): Promise<RoundTasks | null> {
  const response = await apiFetch(
    `/api/tasks/${encodeURIComponent(roundId)}?parentUUID=${encodeURIComponent(parentUUID)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  return apiResult(response);
}

/** Whole record each time: the store has no partial merge. */
export async function saveRoundTasks(request: SaveRoundTasksRequest): Promise<RoundTasks> {
  return apiResult(
    await apiFetch(`/api/tasks/${encodeURIComponent(request.roundId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

/**
 * Write a whole round draft. `use-room-plan` owns the editor's debounced saves;
 * this is the direct write the rounds overview uses for room count and auto-assign.
 */
export async function saveRoundPlan(
  parentUUID: string,
  draft: RoundPlanDraft,
  expectedRevision: number,
): Promise<RoundPlan> {
  const body: SaveRoundPlanRequest = { ...draft, parentUUID, expectedRevision };
  return apiResult(
    await apiFetch(`/api/rounds/${encodeURIComponent(draft.roundId)}/rooms`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Also returns the workspace: the round's status and revision changed with it. */
export async function markRoundLaunched(
  parentUUID: string,
  roundId: string,
): Promise<LiveActionResponse> {
  return apiResult(
    await apiFetch("/api/live/launch", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({parentUUID, roundId}),
    })
  )
}

/** Negative seconds shorten the round. 404 when no timed round is running. */
export async function adjustRoundTime(
  parentUUID: string,
  seconds: number,
): Promise<LiveState> {
  return apiResult(
    await apiFetch("/api/live/extend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentUUID, seconds }),
    }),
  );
}

/** A participant's tap on their room's status. The new state also arrives over SSE. */
export async function setRoomStatus(request: SetRoomStatusRequest): Promise<LiveState> {
  return apiResult(
    await apiFetch("/api/live/room-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

/** Skip a round the host will not run, or put a skipped one back. */
export async function setRoundSkipped(
  parentUUID: string,
  roundId: string,
  skipped: boolean,
): Promise<Workspace> {
  return apiResult(
    await apiFetch("/api/live/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentUUID, roundId, skipped }),
    }),
  );
}

export async function markRoundClosed(
  parentUUID: string,
): Promise<LiveActionResponse> {
  return apiResult(
    await apiFetch("/api/live/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentUUID }),
    }),
  );
}

/** Workflows this meeting has ended, newest first. */
export async function readPastWorkflows(parentUUID: string): Promise<PastWorkflow[]> {
  return apiResult(await apiFetch(`/api/workspace/past?parentUUID=${encodeURIComponent(parentUUID)}`, { cache: "no-store" }));
}

/** The signed-in Zoom user's saved templates, newest first. The backend reads the owner from the token. */
export async function readTemplates(): Promise<SavedTemplate[]> {
  return apiResult(await apiFetch("/api/templates", { cache: "no-store" }));
}

export async function saveTemplate(request: SaveTemplateRequest): Promise<SavedTemplate> {
  return apiResult(
    await apiFetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

/** Returns the templates left after the delete. */
export async function deleteTemplate(templateId: string): Promise<SavedTemplate[]> {
  return apiResult(await apiFetch(`/api/templates/${encodeURIComponent(templateId)}`, { method: "DELETE" }));
}

/** Save the workflow being built as one of the user's templates. */
export async function saveCurrentAsTemplate(request: SaveCurrentTemplateRequest): Promise<SavedTemplate> {
  return apiResult(
    await apiFetch("/api/templates/current", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

/** Ask the AI for a workflow, or for the details it needs first. Host only; saves nothing. */
export async function draftWorkflowWithAi(
  request: DraftWorkflowRequest,
  signal: AbortSignal,
): Promise<DraftWorkflowResponse> {
  return apiResult(
    await apiFetch("/api/ai/workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    }),
  );
}

/** Who Zoom reports in the meeting; the backend fills in anyone webhooks missed. */
export async function postRoster(
  parentUUID: string,
  participants: RosterEntry[],
): Promise<LiveState> {
  return apiResult(
    await apiFetch("/api/live/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentUUID, participants }),
    }),
  );
}

/** Which Zoom room each planned room runs in, read from Zoom's room list by the host. */
export async function postRoomLinks(parentUUID: string, roundId: string, links: RoomLink[]): Promise<LiveState> {
  return apiResult(
    await apiFetch("/api/live/room-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentUUID, roundId, links }),
    }),
  );
}

function roomResponsesUrl(roundId: string, roomId: string): string {
  return `/api/responses/${encodeURIComponent(roundId)}/rooms/${encodeURIComponent(roomId)}`;
}

/** The host's view of a room: every submitted answer, every note and tick. Drafts carry no text. */
export async function readRoomResultsForHost(
  parentUUID: string,
  roundId: string,
  roomId: string,
): Promise<RoomResponsesHostView> {
  const query = `parentUUID=${encodeURIComponent(parentUUID)}`;
  return apiResult(await apiFetch(`${roomResponsesUrl(roundId, roomId)}/all?${query}`, { cache: "no-store" }));
}

/** The caller's view of their room: notes, ticks, own answers, everyone's answer status. */
export async function readRoomResponses(
  parentUUID: string,
  roundId: string,
  roomId: string,
  participantUUID: string,
): Promise<RoomResponsesView> {
  const query = `parentUUID=${encodeURIComponent(parentUUID)}&participantUUID=${encodeURIComponent(participantUUID)}`;
  return apiResult(await apiFetch(`${roomResponsesUrl(roundId, roomId)}?${query}`, { cache: "no-store" }));
}

/** Tick or untick one task checklist item for the whole room. */
export function saveTick(roundId: string, roomId: string, itemId: string, request: TickRequest) {
  return writeRoomResponse("PUT", `${roomResponsesUrl(roundId, roomId)}/ticks/${encodeURIComponent(itemId)}`, request);
}

async function writeRoomResponse(
  method: "PUT" | "POST" | "DELETE",
  url: string,
  request: object,
): Promise<RoomResponsesView> {
  return apiResult(
    await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

/** Autosave ("working") or "Submit to host" ("submitted") one individual answer. */
export function saveAnswer(roundId: string, roomId: string, activityId: string, request: SaveAnswerRequest) {
  return writeRoomResponse("PUT", `${roomResponsesUrl(roundId, roomId)}/answers/${encodeURIComponent(activityId)}`, request);
}

export function addIdea(roundId: string, roomId: string, activityId: string, request: AddIdeaRequest) {
  return writeRoomResponse("POST", `${roomResponsesUrl(roundId, roomId)}/ideas/${encodeURIComponent(activityId)}`, request);
}

/** Author only. */
export function editIdea(roundId: string, roomId: string, activityId: string, noteId: string, request: EditIdeaRequest) {
  return writeRoomResponse(
    "PUT",
    `${roomResponsesUrl(roundId, roomId)}/ideas/${encodeURIComponent(activityId)}/${encodeURIComponent(noteId)}`,
    request,
  );
}

/** Author only. */
export function removeIdea(roundId: string, roomId: string, activityId: string, noteId: string, request: RemoveIdeaRequest) {
  return writeRoomResponse(
    "DELETE",
    `${roomResponsesUrl(roundId, roomId)}/ideas/${encodeURIComponent(activityId)}/${encodeURIComponent(noteId)}`,
    request,
  );
}

function challengesUrl(roundId: string): string {
  return `/api/challenges/${encodeURIComponent(roundId)}`;
}

async function postJson<T>(method: "POST" | "PUT", url: string, request: object): Promise<T> {
  return apiResult(
    await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

/** The host's polls and quizzes for one round, oldest first, each with live results. */
export async function readChallengesForHost(parentUUID: string, roundId: string): Promise<ChallengeView[]> {
  const query = `parentUUID=${encodeURIComponent(parentUUID)}`;
  return apiResult(await apiFetch(`${challengesUrl(roundId)}?${query}`, { cache: "no-store" }));
}

/** 409 when the round is not running or the last one has not been revealed. */
export function launchChallenge(parentUUID: string, roundId: string, draft: ChallengeDraft): Promise<ChallengeView[]> {
  return postJson("POST", challengesUrl(roundId), { parentUUID, draft });
}

export function revealChallenge(parentUUID: string, roundId: string, challengeId: string): Promise<ChallengeView[]> {
  return postJson("POST", `${challengesUrl(roundId)}/${encodeURIComponent(challengeId)}/reveal`, { parentUUID });
}

/** The round's latest poll or quiz as the caller's room sees it; null when none was launched. */
export async function readRoomChallenge(
  parentUUID: string,
  roundId: string,
  roomId: string,
  participantUUID: string,
): Promise<ChallengeView | null> {
  const query = `parentUUID=${encodeURIComponent(parentUUID)}&participantUUID=${encodeURIComponent(participantUUID)}`;
  return apiResult(
    await apiFetch(`${challengesUrl(roundId)}/rooms/${encodeURIComponent(roomId)}?${query}`, { cache: "no-store" }),
  );
}

function roomAnswerUrl(roundId: string, challengeId: string, roomId: string, part: "picks" | "locks", question: number) {
  return `${challengesUrl(roundId)}/${encodeURIComponent(challengeId)}/rooms/${encodeURIComponent(roomId)}/${part}/${question}`;
}

/** One person's suggestion for a question; the room sees it. */
export function pickChallengeOption(
  roundId: string,
  challengeId: string,
  roomId: string,
  question: number,
  request: ChallengeAnswerRequest,
): Promise<ChallengeView | null> {
  return postJson("PUT", roomAnswerUrl(roundId, challengeId, roomId, "picks", question), request);
}

/** The room's final answer to a question. 409 when someone in the room locked it first. */
export function lockChallengeAnswer(
  roundId: string,
  challengeId: string,
  roomId: string,
  question: number,
  request: ChallengeAnswerRequest,
): Promise<ChallengeView | null> {
  return postJson("POST", roomAnswerUrl(roundId, challengeId, roomId, "locks", question), request);
}
