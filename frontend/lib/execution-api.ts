import type {
  ApiResponse,
  LiveActionResponse,
  LiveState,
  RoundPlan,
  RoomResponsesView,
  RoundPlanDraft,
  RoundTasks,
  SaveRoundPlanRequest,
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

function roomResponsesUrl(roundId: string, roomId: string): string {
  return `/api/responses/${encodeURIComponent(roundId)}/rooms/${encodeURIComponent(roomId)}`;
}

/** The caller's view of their room: notes, ready marks, ticks, own answers, everyone's answer status. */
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
export async function saveTick(
  roundId: string,
  roomId: string,
  itemId: string,
  request: TickRequest,
): Promise<RoomResponsesView> {
  return apiResult(
    await fetch(`${roomResponsesUrl(roundId, roomId)}/ticks/${encodeURIComponent(itemId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}
