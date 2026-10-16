import { useEffect } from "react";

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
    case "noteAsked":
      return state.waitingFor === "note" || posted || pastRoundOne;
    case "visitorPosted":
      return posted || pastRoundOne;
    case "roomOpened":
      return state.hostRoom !== null || pastRoundOne;
    case "ended":
      return pastRoundOne;
  }
}

/**
 * The floating step card: what to do, progress, Back and Next. Next on a step
 * that waits does the action for the visitor. ← and → work too, except while typing.
 */
export default function TourCard({
  step,
  index,
  total,
  onBack,
  onNext,
  onClose,
}: {
  step: TourStep;
  index: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const first = index === 0;
  const last = index === total - 1;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (typing) return;
      if (event.key === "ArrowRight") (last ? onClose : onNext)();
      if (event.key === "ArrowLeft" && !first) onBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    // Always over the meeting: the gallery is decoration, so the card never hides a button it asks for.
    <div className="dm-tour" role="dialog" aria-label="Guided tour">
      <div className="dm-tour__top">
        <span className="dm-tour__count">
          {index + 1} / {total}
        </span>
        <span className="dm-tour__dots" aria-hidden="true">
          {Array.from({ length: total }, (_, dot) => (
            <span key={dot} className={dot <= index ? "dm-tour__dot dm-tour__dot--done" : "dm-tour__dot"} />
          ))}
        </span>
        <button type="button" className="dm-tour__close" aria-label="Close the tour" onClick={onClose}>
          ×
        </button>
      </div>
      <h2 className="dm-tour__title">{step.title}</h2>
      <p className="dm-tour__body">{step.body}</p>
      {step.until ? <p className="dm-tour__waiting">Your turn, or press Next to do it for you.</p> : null}
      <div className="dm-tour__actions">
        {first ? <span /> : (
          <button type="button" className="dm-tour__back" onClick={onBack}>
            ‹ Back
          </button>
        )}
        {/* The last step's button already ends the tour. */}
        {last ? <span /> : (
          <button type="button" className="dm-tour__skip" onClick={onClose}>
            Skip tour
          </button>
        )}
        <button type="button" className="bw-button bw-button--primary bw-button--sm" onClick={last ? onClose : onNext}>
          {last ? "Explore on my own" : "Next ›"}
        </button>
      </div>
    </div>
  );
}
