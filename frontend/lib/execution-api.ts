import type {
  ApiResponse,
  LiveState,
  RoundPlan,
  RoundPlanDraft,
  RoundTasks,
  SaveRoundPlanRequest,
  SaveRoundTasksRequest,
  Workspace,
} from "@/types/breakout";

async function apiResult<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !result.success) {
    throw new Error(result.success ? `Backend returned ${response.status}.` : result.error);
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

export async function markRoundLaunched(
  parentUUID: string,
  roundId: string,
): Promise<LiveState> {
  return apiResult(
    await fetch("/api/live/launch", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({parentUUID, roundId}),
    })
  )
}

export async function markRoundClosed(
  parentUUID: string,
): Promise<LiveState> {
  return apiResult(
    await fetch("/api/live/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentUUID }),
    }),
  );
}
