import type {
  AddIdeaRequest,
  ApiResponse,
  CarryPlacementRequest,
  EditIdeaRequest,
  LiveActionResponse,
  LiveState,
  RoundPlan,
  RemoveIdeaRequest,
  RoomResponsesHostView,
  RoomResponsesView,
  RosterEntry,
  RoundPlanDraft,
  RoundTasks,
  SaveRoundPlanRequest,
  SaveAnswerRequest,
  SaveRoundTasksRequest,
  TickRequest,
  Workspace,
} from "@/types/breakout";

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
    await fetch(
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
  const response = await fetch(`/api/workspace?parentUUID=${encodeURIComponent(parentUUID)}`, {
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
  const response = await fetch(
    `/api/tasks/${encodeURIComponent(roundId)}?parentUUID=${encodeURIComponent(parentUUID)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  return apiResult(response);
}

/** Whole record each time: the store has no partial merge. */
export async function saveRoundTasks(request: SaveRoundTasksRequest): Promise<RoundTasks> {
  return apiResult(
    await fetch(`/api/tasks/${encodeURIComponent(request.roundId)}`, {
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
    await fetch(`/api/rounds/${encodeURIComponent(draft.roundId)}/rooms`, {
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
    await fetch("/api/live/launch", {
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
    await fetch("/api/live/extend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentUUID, seconds }),
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
    await fetch("/api/live/skip", {
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
    await fetch("/api/live/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentUUID }),
    }),
  );
}

/** Adds a mid-round placement to the same-named room of each later round not yet run. */
export async function carryPlacement(request: CarryPlacementRequest): Promise<{ updatedRoundIds: string[] }> {
  return apiResult(
    await fetch(`/api/rounds/${encodeURIComponent(request.roundId)}/carry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

/** Who Zoom reports in the meeting; the backend fills in anyone webhooks missed. */
export async function postRoster(
  parentUUID: string,
  participants: RosterEntry[],
): Promise<LiveState> {
  return apiResult(
    await fetch("/api/live/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentUUID, participants }),
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
  return apiResult(await fetch(`${roomResponsesUrl(roundId, roomId)}/all?${query}`, { cache: "no-store" }));
}

/** The caller's view of their room: notes, ticks, own answers, everyone's answer status. */
export async function readRoomResponses(
  parentUUID: string,
  roundId: string,
  roomId: string,
  participantUUID: string,
): Promise<RoomResponsesView> {
  const query = `parentUUID=${encodeURIComponent(parentUUID)}&participantUUID=${encodeURIComponent(participantUUID)}`;
  return apiResult(await fetch(`${roomResponsesUrl(roundId, roomId)}?${query}`, { cache: "no-store" }));
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
    await fetch(url, {
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
