"use client";

/**
 * Single owner of the Zoom SDK bootstrap.
 *
 * `config()` may only run once per page, but several hooks need the configured
 * SDK: the host gate reads the role, the room snapshot reads the breakout list,
 * and later slices add more. This module runs the call once and hands the same
 * result to every caller, so no two hooks can race over it.
 */

/** The SDK object once it is known to be present on the page. */
export type ZoomSdk = NonNullable<Window["zoomSdk"]>;

/**
 * Capability list passed to `config()`. Every capability must also be ticked on
 * the app's API list in the Zoom Marketplace, otherwise the call fails at run
 * time with `reason:app_not_support`.
 */
export const ZOOM_CAPABILITIES = [
  "getMeetingUUID",
  "getMeetingContext",
  "getUserContext",
  "onMyUserContextChange",
  "getBreakoutRoomList",
  "createBreakoutRooms",
  "getMeetingParticipants",
  "onBreakoutRoomChange",
];

/** Error code shown when the SDK is not on the page at all, e.g. a plain browser tab. */
export const SDK_MISSING_CODE = "ZOOM_SDK_UNAVAILABLE";

export interface SdkErrorInfo {
  /** Machine-readable code, rendered verbatim so it can be searched in Zoom's docs. */
  code: string;
  message: string;
}

/**
 * Outcome of the bootstrap. The two cases carry different fields, so they are a
 * union rather than one object with everything optional.
 */
export type ZoomBootstrap =
  | { kind: "ready"; sdk: ZoomSdk; meetingUUID: string }
  | { kind: "unavailable"; error: SdkErrorInfo };

/**
 * Pulls a code and a message out of whatever the SDK rejected with. The SDK is
 * not consistent about the shape, and a thrown value is not always an Error, so
 * this narrows defensively rather than trusting a cast.
 */
export function normalizeSdkError(error: unknown, fallbackCode: string): SdkErrorInfo {
  if (typeof error !== "object" || error === null) {
    return { code: fallbackCode, message: String(error ?? "No error detail.") };
  }

  // The SDK rejects with real Error objects that carry `code` as an own
  // property. The property is read before the Error branch below, because an
  // instanceof check first would throw the code away and report the caller's
  // fallback for every rejection.
  const { code, type, message } = error as ZoomSdkError;

  const resolvedCode =
    code !== undefined && code !== null ? String(code) : (type ?? fallbackCode);

  const resolvedMessage =
    message ?? (error instanceof Error ? error.message : "No message returned by the SDK.");

  return { code: resolvedCode, message: resolvedMessage };
}

/**
 * Memoised bootstrap promise. It is deliberately module scope rather than a ref:
 * the constraint being enforced is one `config()` per page, not one per
 * component, and strict mode remounts must reuse the same call.
 */
let bootstrapPromise: Promise<ZoomBootstrap> | null = null;

async function bootstrap(): Promise<ZoomBootstrap> {
  const sdk = window.zoomSdk;

  if (!sdk) {
    return {
      kind: "unavailable",
      error: {
        code: SDK_MISSING_CODE,
        message: "window.zoomSdk is not present. Open this app inside the Zoom client.",
      },
    };
  }

  try {
    await sdk.config({ version: "0.16", capabilities: ZOOM_CAPABILITIES });
    const { meetingUUID } = await sdk.getMeetingUUID();

    return { kind: "ready", sdk, meetingUUID };
  } catch (error) {
    // A rejected config() means a capability is unavailable on this client,
    // which is the unsupported case rather than a role problem.
    return { kind: "unavailable", error: normalizeSdkError(error, "CONFIG_FAILED") };
  }
}

/** Configures the SDK on first call and replays the same answer afterwards. */
export function configureZoomSdk(): Promise<ZoomBootstrap> {
  bootstrapPromise ??= bootstrap();
  return bootstrapPromise;
}
