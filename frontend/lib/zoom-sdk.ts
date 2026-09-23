"use client";

/**
 * Single owner of the Zoom SDK bootstrap.
 *
 * `config()` runs in two stages, because the capability list depends on the
 * role and the role can only be read once the SDK is configured. Stage one asks
 * for the read-only capabilities everybody has. Stage two adds the breakout
 * methods, and runs only for a host or co-host. Asking an attendee for the
 * breakout methods rejects the whole call with `reason:require_meeting_role`,
 * which would hide the participant screen behind an SDK error.
 *
 * Zoom permits repeat `config()` calls and documents one as the way to pick up
 * new permissions after a role change, so a promotion mid-meeting re-runs
 * stage two rather than reloading the page.
 */

/** The SDK object once it is known to be present on the page. */
export type ZoomSdk = NonNullable<Window["zoomSdk"]>;

/**
 * Documented by Zoom as available to every role, including guests. Anything
 * else in this list rejects the whole `config()` call for an attendee.
 */
const BASE_CAPABILITIES = ["getMeetingUUID", "getUserContext"];

/**
 * Host and co-host only, per Zoom's "Supported roles" line on each method.
 * `getMeetingContext` and `onMyUserContextChange` are restricted too, which is
 * easy to miss: neither of them touches breakout rooms.
 */
const HOST_CAPABILITIES = [
  "getMeetingContext",
  "onMyUserContextChange",
  "configureBreakoutRooms",
  "createBreakoutRooms",
  "assignParticipantToBreakoutRoom",
  "openBreakoutRooms",
  "closeBreakoutRooms",
  "getBreakoutRoomList",
];

/**
 * Everything the app can ever ask for. Every entry must also be ticked on the
 * app's API list in the Zoom Marketplace, otherwise the call fails at run time
 * with `reason:app_not_support`.
 */
export const ZOOM_CAPABILITIES = [...BASE_CAPABILITIES, ...HOST_CAPABILITIES];

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
    await sdk.config({ version: "0.16", capabilities: BASE_CAPABILITIES });
    const { meetingUUID, parentUUID } = await sdk.getMeetingUUID();

    // A participant runs this from inside a breakout room, where meetingUUID is
    // the room. Every store is keyed by the main meeting, so prefer parentUUID.
    return { kind: "ready", sdk, meetingUUID: parentUUID ?? meetingUUID };
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

let hostPromise: Promise<SdkErrorInfo | null> | null = null;

/**
 * Call when this user loses the host seat. Zoom revokes the breakout
 * capabilities on demotion, so a later promotion has to run stage two again
 * rather than replay a cached success.
 */
export function forgetHostCapabilities(): void {
  hostPromise = null;
}

/**
 * Stage two. Call once the role is known to be host or co-host. Resolves to null
 * when the breakout methods are now available, or to the SDK's own error when
 * this client cannot drive breakouts at all.
 */
export function grantHostCapabilities(sdk: ZoomSdk): Promise<SdkErrorInfo | null> {
  hostPromise ??= sdk
    .config({ version: "0.16", capabilities: ZOOM_CAPABILITIES })
    .then(() => null)
    .catch((error: unknown) => {
      // Let a later promotion try again rather than caching the failure.
      hostPromise = null;
      return normalizeSdkError(error, "CONFIG_FAILED");
    });
  return hostPromise;
}
