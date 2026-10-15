import { useState } from "react";

import type { Scenario } from "@/data/scenarios/types";

/** First screen of the demo: what this is, which session to run, tour or free exploring. */
export default function WelcomeModal({
  scenarios,
  selectedId,
  onStart,
}: {
  scenarios: Scenario[];
  selectedId: string;
  onStart: (scenarioId: string, tour: boolean) => void;
}) {
  const [picked, setPicked] = useState(selectedId);

  return (
    <div className="bw-overlay dm-welcome" role="dialog" aria-modal="true" aria-label="Welcome to the demo">
      <div className="bw-overlay__panel bw-overlay__panel--sm">
        <div className="bw-overlay__body">
          <span className="dm-topbar__brand dm-welcome__brand">
            <span className="dm-topbar__mark" aria-hidden="true">B</span>
            Breakout Workspace
          </span>
          <h2 className="dm-welcome__title">Welcome to the interactive demo</h2>
          <p className="dm-app__goal">
            This is a simulated Zoom meeting. Breakout Workspace is a Zoom App that plans and runs breakout rooms; here it is
            docked where Zoom shows it, for the host and for one participant: you.
          </p>
          <p className="dm-app__meta">The tour takes about two minutes. Nothing you type leaves your browser.</p>

          <fieldset className="dm-welcome__picker">
            <legend className="bw-section-label">Pick a session</legend>
            {scenarios.map((scenario) => (
              <label key={scenario.id} className="dm-welcome__option">
                <input
                  type="radio"
                  name="scenario"
                  checked={picked === scenario.id}
                  onChange={() => setPicked(scenario.id)}
                />
                {scenario.label}
              </label>
            ))}
          </fieldset>
        </div>
        <div className="bw-overlay__footer">
          <button type="button" className="dm-tour__skip" onClick={() => onStart(picked, false)}>
            Skip, let me explore
          </button>
          <button type="button" className="bw-button bw-button--primary bw-button--md" onClick={() => onStart(picked, true)}>
            Start the tour
          </button>
        </div>
      </div>
    </div>
  );
}
