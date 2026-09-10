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

  interface ZoomMeetingParticipant {
    participantUUID: string;
    participantId?: string | number;
    /** Optional for the same reason as the breakout member fields below. */
    screenName?: string;
    /** Present on the roster, and the only reliable way to identify the host. */
    role?: ZoomSdkRole;
  }

  /**
   * One member of a breakout room.
   *
   * Every field is optional on purpose. The payload is not consistent between
   * SDK versions: some builds name the person with `screenName`, others with
   * `displayName`, and some list membership as bare UUID strings with no name
   * at all. Declaring the optimistic shape made TypeScript vouch for fields
   * that are not always there, so the normalizer read undefined at run time.
   */
  /**
   * How Zoom describes a person's relationship to a breakout room. Observed
   * value: "assigned". It means the person is allotted to the room, which is
   * not the same as being inside it, so it is carried through rather than
   * assumed to mean presence.
   */
  type ZoomBreakoutParticipantStatus = "assigned" | "joined" | "not_joined" | (string & {});

  interface ZoomBreakoutMember {
    participantUUID?: string;
    /** A number here, though the meeting roster reports the same id as a string. */
    participantId?: string | number;
    /** The breakout list names people with displayName; the roster uses screenName. */
    displayName?: string;
    screenName?: string;
    name?: string;
    participantStatus?: ZoomBreakoutParticipantStatus;
  }

  interface ZoomBreakoutRoom {
    breakoutRoomId: string;
    name: string;
    /** A bare string is a participantUUID with no name attached. */
    participants?: (ZoomBreakoutMember | string)[];
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

      getMeetingContext: () => Promise<unknown>;

      getUserContext: () => Promise<ZoomUserContext>;

      getBreakoutRoomList: () => Promise<{
        rooms: ZoomBreakoutRoom[];
      }>;

      /**
       * Everybody in the parent meeting, whether or not they sit in a room.
       * getBreakoutRoomList() reports room membership only, so this is the only
       * way to learn who has not been placed yet.
       */
      getMeetingParticipants: () => Promise<{
        participants: ZoomMeetingParticipant[];
      }>;

      /**
       * Fires only for the current user's own context. The SDK has no matching
       * `offMyUserContextChange`, so unsubscribing goes through
       * `removeEventListener` below. Without that cleanup every remount of the
       * gate would leave another live listener behind.
       */
      onMyUserContextChange: (
        callback: (event: ZoomUserContextChangeEvent) => void,
      ) => void;

      onBreakoutRoomChange: (callback: (event: unknown) => void) => void;

      /**
       * Generic listener pair. `removeEventListener` is the only supported way
       * to detach a handler: the SDK exposes `on<Event>` shorthands but no
       * `off<Event>` counterparts.
       */
      addEventListener: (
        event: string,
        callback: (event: never) => void,
      ) => Promise<unknown>;
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
