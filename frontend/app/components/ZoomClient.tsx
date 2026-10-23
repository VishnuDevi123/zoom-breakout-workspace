"use client";

import { useEffect, useState } from "react";

import { useHostGate } from "@/lib/host-gate";

import HostWorkspace from "./screens/HostWorkspace";
import LoadingScreen from "./screens/LoadingScreen";
import ParticipantScreen from "./screens/ParticipantScreen";
import UnsupportedScreen from "./screens/UnsupportedScreen";

/** The start-up spinner shows at least this long, so a fast load does not flash past it. */
const STARTUP_MIN_LOADING_MS = 500;

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
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), STARTUP_MIN_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);

  // The real screen mounts at once and loads its data behind the spinner; the
  // wrapper never changes, so revealing it does not remount anything.
  return (
    <>
      {minElapsed ? null : <LoadingScreen message="Connecting to Zoom…" />}
      <div hidden={!minElapsed}>
        <GateScreen />
      </div>
    </>
  );
}

/** One of the four gate states: checking, host, participant, unsupported. */
function GateScreen() {
  const { state, role, meetingUUID, participantUUID, meetingTopic, sdkError, recheckRole } =
    useHostGate();

  switch (state) {
    case "host":
      return (
        <HostWorkspace
          meetingUUID={meetingUUID}
          meetingTopic={meetingTopic}
          role={role}
        />
      );

    case "participant":
      return (
        <ParticipantScreen
          parentUUID={meetingUUID}
          participantUUID={participantUUID}
          onPromoted={recheckRole}
        />
      );

    case "unsupported":
      return <UnsupportedScreen error={sdkError} />;

    case "checking":
    default:
      return <LoadingScreen message="Connecting to Zoom…" />;
  }
}
