import type { ApiResponse, LiveState, RoundPlan } from "@/types/breakout";

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
