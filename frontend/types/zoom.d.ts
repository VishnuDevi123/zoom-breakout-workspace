export {};

/**
 * Ambient declarations for the Zoom Apps JS SDK surface this app touches.
 *
 * The Zoom client injects the SDK into the page, so the app reaches it through
 * `window.zoomSdk` rather than an import. Only the calls the app actually makes
 * are declared here. Anything undeclared becomes a compile error, which stops a
 * typo from reaching the Zoom client unnoticed.
 */

declare global {
  /**
   * Role string the SDK reports. These are the SDK's own literals, so no
   * mapping table exists that could drift. `coHost` carries the same breakout
   * powers as `host`. `attendee` is everybody else.
   */
  type ZoomSdkRole = "host" | "coHost" | "attendee";

  /**
   * Presence of the current user in the meeting. This says whether the person
   * has arrived. It is unrelated to `ParticipantStatus` in
   * `types/breakout.ts`, which describes room placement instead.
   */
  type ZoomSdkUserStatus =
    | "authorized"
    | "in_meeting"
    | "in_waiting_room"
    | "attention"
    | (string & {});

  interface ZoomUserContext {
    role: ZoomSdkRole;
    screenName: string;
    participantId: string;
    participantUUID: string;
    status: ZoomSdkUserStatus;
  }

  /**
   * Payload delivered when the current user's own context changes, for example
   * when the host promotes them to co-host mid-meeting.
   */
  interface ZoomUserContextChangeEvent {
    role: ZoomSdkRole;
    status: ZoomSdkUserStatus;
    screenName?: string;
    participantId?: string;
    participantUUID?: string;
    timestamp?: number;
  }

  /**
   * How Zoom places people when rooms are created. The app creates rooms with
   * "manually", because assignment is the host's job in slice 5 rather than
   * something Zoom should decide at creation time.
   */
  type ZoomBreakoutAssignMethod = "automatically" | "manually" | "participantsChoose";

  /**
   * Options accepted by createBreakoutRooms(). `names` is index-aligned with the
   * rooms Zoom creates, and its length must equal `numberOfRooms`; Zoom rejects
   * the call with code 10122 otherwise.
   */
  interface ZoomCreateBreakoutRoomsOptions {
    /** Between 1 and 50. */
    numberOfRooms: number;
    assign: ZoomBreakoutAssignMethod;
    /** Requires Zoom desktop client 5.12.6 or newer. */
    names?: string[];
  }

  interface ZoomBreakoutRoom {
    breakoutRoomId: string;
    name: string;
  }

  interface ZoomBreakoutRoomsResponse {
    rooms: ZoomBreakoutRoom[];
    state: "open" | "closed";
  }

  /**
   * Shape the SDK rejects with. `code` is the machine-readable part, and it is
   * what the unsupported screen shows the host, because that is the value which
   * is searchable in Zoom's documentation.
   */
  interface ZoomSdkError {
    code?: number | string;
    type?: string;
    message?: string;
  }

  interface Window {
    zoomSdk?: {
      config: (options: {
        version?: string;
        capabilities: string[];
      }) => Promise<unknown>;

      getMeetingUUID: () => Promise<{
        meetingUUID: string;
      }>;

      getMeetingContext: () => Promise<{
        meetingTopic: string;
        meetingID: string;
      }>;

      getUserContext: () => Promise<ZoomUserContext>;

      createBreakoutRooms: (
        options: ZoomCreateBreakoutRoomsOptions,
      ) => Promise<ZoomBreakoutRoomsResponse>;

      /** Omit `uuid` to send the person back to the main meeting. */
      assignParticipantToBreakoutRoom: (options: {
        participantUUID: string;
        uuid?: string;
      }) => Promise<ZoomBreakoutRoomsResponse>;
      openBreakoutRooms: () => Promise<unknown>;
      closeBreakoutRooms: () => Promise<unknown>;

      /**
       * Fires only for the current user's own context. The SDK has no matching
       * `offMyUserContextChange`, so unsubscribing goes through
       * `removeEventListener` below. Without that cleanup every remount of the
       * gate would leave another live listener behind.
       */
      onMyUserContextChange: (
        callback: (event: ZoomUserContextChangeEvent) => void,
      ) => void;

      /**
       * Returns undefined instead of a promise when the SDK declines the call,
       * for example when config() has not resolved yet, so callers must not
       * chain onto the result directly.
       */
      removeEventListener: (
        event: string,
        callback: (event: never) => void,
      ) => Promise<unknown> | void;

      onAuthorized: (callback: (event: unknown) => void) => void;
    };
  }
}
