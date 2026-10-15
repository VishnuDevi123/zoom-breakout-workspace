import type { TourEvent, TourStep } from "@/data/scenarios/types";

import type { DemoState } from "../demo-state";

/**
 * True once the visitor has done what a step waits for. Every event stays true
 * for the rest of round 1, so the tour can be worked out from the state alone.
 */
export function reached(event: TourEvent, state: DemoState, visitorId: string): boolean {
  const pastRoundOne = state.roundIndex > 0 || state.phase === "ended";
  const answered = state.answers.some((answer) => answer.by === visitorId);
  const posted = state.notes.some((note) => note.by === visitorId);
  switch (event) {
    case "hostAppOpened":
      return state.apps.host;
    case "proposal":
      return state.ai === "proposal" || state.ai === "used";
    case "used":
      return state.ai === "used";
    case "launched":
      return state.phase !== "planning" || state.roundIndex > 0;
    case "appAsked":
      return state.waitingFor === "openApp" || state.apps.participant || pastRoundOne;
    case "participantAppOpened":
      return state.apps.participant;
    case "visitorTurn":
      return state.waitingFor === "answer" || answered || pastRoundOne;
    case "visitorAnswered":
      return answered || pastRoundOne;
    case "visitorPosted":
      return posted || pastRoundOne;
    case "roomOpened":
      return state.hostRoom !== null || pastRoundOne;
    case "ended":
      return pastRoundOne;
  }
}

/** The floating step card: what to do and the way out. The stage's focus ring shows where. */
export default function TourCard({
  step,
  index,
  total,
  onNext,
  onClose,
}: {
  step: TourStep;
  index: number;
  total: number;
  onNext: () => void;
  onClose: () => void;
}) {
  const last = index === total - 1;

  return (
    // Always over the meeting: the gallery is decoration, so the card never hides a button it asks for.
    <div className="dm-tour" role="dialog" aria-label="Guided tour">
      <span className="dm-tour__count">
        {index + 1} / {total}
      </span>
      <h2 className="dm-tour__title">{step.title}</h2>
      <p className="dm-tour__body">{step.body}</p>
      <div className="dm-tour__actions">
        <button type="button" className="dm-tour__skip" onClick={onClose}>
          {last ? "Close" : "Skip tour"}
        </button>
        {step.until ? (
          <span className="dm-tour__waiting">Waiting for you…</span>
        ) : (
          <button type="button" className="bw-button bw-button--primary bw-button--sm" onClick={last ? onClose : onNext}>
            {last ? "Explore on my own" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
