import type { Scenario, TalkLine, TourEvent } from "@/data/scenarios/types";

import { demoReducer, initialDemoState, visitorRoom, type DemoAction, type DemoState } from "./demo-state";

/** The room's lines from now up to and including the visitor's next turn of this kind. */
function talkUntil(state: DemoState, scenario: Scenario, waitFor: "openApp" | "answer" | "note"): TalkLine[] {
  const talk = scenario.rounds[state.roundIndex]?.talk ?? [];
  const turn = talk.findIndex((line, index) => index >= state.talkIndex && line.kind === "visitorTurn" && line.waitFor === waitFor);
  return talk.slice(state.talkIndex, turn === -1 ? talk.length : turn + 1);
}

/** What the visitor would have done to make `event` happen; Next does it for them. */
function actionsFor(event: TourEvent, state: DemoState, scenario: Scenario, now: number): DemoAction[] {
  const visitor = scenario.visitor.id;
  const suggested = scenario.rounds[state.roundIndex]?.suggested;
  switch (event) {
    case "hostAppOpened":
      return [{ kind: "openApp", role: "host", open: true }];
    case "proposal":
      return [{ kind: "generated" }];
    case "used":
      return [{ kind: "useWorkflow" }];
    case "launched":
      return [{ kind: "launch", roundIndex: state.roundIndex }, { kind: "launched", at: now }];
    case "appAsked":
      return [{ kind: "skip", lines: talkUntil(state, scenario, "openApp") }];
    case "participantAppOpened":
      return [{ kind: "openApp", role: "participant", open: true }];
    case "visitorTurn":
      return [{ kind: "skip", lines: talkUntil(state, scenario, "answer") }];
    // The room talks up to the visitor's turn first, so everything the host should see has arrived.
    case "visitorAnswered":
      return [
        { kind: "skip", lines: talkUntil(state, scenario, "answer") },
        { kind: "answer", by: visitor, text: suggested?.individual ?? "", visitor: true },
      ];
    case "noteAsked":
      return [{ kind: "skip", lines: talkUntil(state, scenario, "note") }];
    case "visitorPosted":
      return [
        { kind: "skip", lines: talkUntil(state, scenario, "note") },
        { kind: "note", by: visitor, text: suggested?.note ?? "", visitor: true },
      ];
    case "roomOpened":
      return [{ kind: "openRoom", room: visitorRoom(scenario, state.roundIndex) }];
    case "ended": {
      const talk = scenario.rounds[state.roundIndex]?.talk ?? [];
      return [{ kind: "end", rest: talk.slice(state.talkIndex) }];
    }
  }
}

/** The demo state once `event` has happened, as if the visitor did it. */
export function fulfil(event: TourEvent, state: DemoState, scenario: Scenario, now: number): DemoState {
  return actionsFor(event, state, scenario, now).reduce(demoReducer, state);
}

/**
 * The demo state at the start of tour step `stepIndex`: a fresh demo with every
 * earlier step done for the visitor. The script is fixed, so it is the same
 * state each time; the visitor's own typed words become the suggestions.
 */
export function stateAtStep(stepIndex: number, scenario: Scenario, now: number): DemoState {
  return scenario.tour
    .slice(0, stepIndex)
    .reduce((state, step) => (step.until ? fulfil(step.until, state, scenario, now) : state), initialDemoState);
}
