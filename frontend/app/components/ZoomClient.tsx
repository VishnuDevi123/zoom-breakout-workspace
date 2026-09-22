"use client";

import { useHostGate } from "@/lib/host-gate";

import CheckingScreen from "./screens/CheckingScreen";
import HostWorkspace from "./screens/HostWorkspace";
import ParticipantScreen from "./screens/ParticipantScreen";
import UnsupportedScreen from "./screens/UnsupportedScreen";

/**
 * Slice 1 gate.
 *
 * ZoomClient owns the only Zoom SDK conversation on the page and picks one of
 * the four states from it: checking, host, participant, unsupported. Because
 * the choice is state and not navigation, a promotion to co-host swaps the
 * screen with no reload, and a demotion takes the controls back the same way.
 *
 * The whole page hangs off this component, so page.tsx stays a thin server
 * component and no host control is ever rendered before the role is known.
 */
export default function ZoomClient() {
  const { state, role, screenName, meetingUUID, meetingTopic, sdkError } = useHostGate();

  switch (state) {
    case "host":
      return (
        <HostWorkspace
          meetingUUID={meetingUUID}
          meetingTopic={meetingTopic}
          screenName={screenName}
          role={role}
        />
      );

    case "participant":
      return <ParticipantScreen screenName={screenName} meetingUUID={meetingUUID} />;

    case "unsupported":
      return <UnsupportedScreen error={sdkError} />;

    case "checking":
    default:
      return <CheckingScreen />;
  }
}
