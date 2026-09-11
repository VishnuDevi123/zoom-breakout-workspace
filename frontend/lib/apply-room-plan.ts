import { recordRawSdkError, recordRawSdkRead } from "@/lib/debug/raw-sdk-read";
import { configureZoomSdk, normalizeSdkError, type SdkErrorInfo } from "@/lib/zoom-sdk";
import type { ApiResponse, RoomSnapshot } from "@/types/breakout";

async function storeIntendedNames(parentUUID: string, names: string[]): Promise<void> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentUUID, names }),
  });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);

  const result = (await response.json()) as ApiResponse<RoomSnapshot>;
  if (!result.success) throw new Error(result.error);
}

/** Future Apply/Launch adapter. Draft editing never calls this Zoom mutation. */
export async function applyRoomNamesToZoom(
  names: string[],
): Promise<{ success: true } | { success: false; error: SdkErrorInfo }> {
  const bootstrap = await configureZoomSdk();
  if (bootstrap.kind === "unavailable") return { success: false, error: bootstrap.error };

  try {
    const created = await bootstrap.sdk.createBreakoutRooms({
      numberOfRooms: names.length,
      assign: "manually",
      names,
    });
    recordRawSdkRead("createBreakoutRooms:", created);

    try {
      await storeIntendedNames(bootstrap.meetingUUID, names);
    } catch (error) {
      console.error("Storing intended room names failed:", error);
    }
    return { success: true };
  } catch (error) {
    recordRawSdkError("createBreakoutRooms failed:", error);
    return {
      success: false,
      error: normalizeSdkError(error, "CREATE_BREAKOUT_ROOMS_FAILED"),
    };
  }
}
