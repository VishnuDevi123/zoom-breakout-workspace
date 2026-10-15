"use client";

import { useState } from "react";

import type { Scenario } from "@/data/scenarios/types";

import DemoMeeting from "./DemoMeeting";
import WelcomeModal from "./WelcomeModal";

/**
 * The demo page: the welcome modal, then one meeting run. Reset and Replay
 * remount the meeting (a new key), which starts it from a clean state.
 */
export default function DemoApp({ scenarios }: { scenarios: Scenario[] }) {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [welcome, setWelcome] = useState(true);
  const [tour, setTour] = useState(false);
  const [run, setRun] = useState(0);
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId) ?? scenarios[0];

  function restart(withTour: boolean) {
    setTour(withTour);
    setRun((current) => current + 1);
  }

  return (
    <>
      <DemoMeeting
        key={`${scenario.id}-${run}`}
        scenario={scenario}
        tour={tour}
        appsOpen={!tour}
        onTourClose={() => setTour(false)}
        onReplay={() => restart(true)}
        onReset={() => restart(false)}
      />
      {welcome ? (
        <WelcomeModal
          scenarios={scenarios}
          selectedId={scenarioId}
          onStart={(pickedId, withTour) => {
            setScenarioId(pickedId);
            setWelcome(false);
            restart(withTour);
          }}
        />
      ) : null}
    </>
  );
}
