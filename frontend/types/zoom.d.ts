export {};

declare global {
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

      getBreakoutRoomList: () => Promise<unknown>;

      onBreakoutRoomChange: (callback: (event: unknown) => void) => void;
    };
  }

}

