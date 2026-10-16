"use client";

import { useState } from "react";

import type { Scenario } from "@/data/scenarios/types";

import DemoMeeting from "./DemoMeeting";

/**
 * The demo page: the meeting opens straight into the guided tour. Replay tour
 * remounts the meeting (a new key), which starts it from a clean state.
 */
export default function DemoApp({ scenario }: { scenario: Scenario }) {
  const [tour, setTour] = useState(true);
  const [run, setRun] = useState(0);

  return (
    <DemoMeeting
      key={run}
      scenario={scenario}
      tour={tour}
      onTourClose={() => setTour(false)}
      onReplay={() => {
        setTour(true);
        setRun((current) => current + 1);
      }}
    />
  );
}
