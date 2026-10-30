"use client";

import { useEffect, useRef, useState } from "react";

import {
  addQuestion,
  CHALLENGE_KINDS,
  draftProblem,
  launchableDraft,
  MAX_OPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TITLE_LENGTH,
  optionLetter,
  removeOption,
  removeQuestion,
  setQuestion,
} from "@/lib/challenges";
import { formatClock } from "@/lib/round-clock";
import { MAX_CHALLENGE_OPTIONS, MAX_QUIZ_QUESTIONS, type ChallengeDraft } from "@/types/breakout";

import ChallengeScrollBody from "./ChallengeScrollBody";
import { Button, Modal, SectionLabel } from "./ui";

/**
 * Write a poll or a quiz and launch it to every room. The draft lives in the
 * live page, so closing this keeps it until it is launched. A poll is one
 * question; a quiz has a title, up to 10 questions and a right answer for each.
 */
export default function ChallengeEditor({
  draft,
  roomCount,
  onChange,
  onLaunch,
  onClose,
}: {
  draft: ChallengeDraft;
  /** Rooms it goes to, for the Launch button. */
  roomCount: number;
  onChange: (draft: ChallengeDraft) => void;
  /** Resolves false when the launch failed; the editor then stays open. */
  onLaunch: (draft: ChallengeDraft) => Promise<boolean>;
  onClose: () => void;
}) {
  const [launching, setLaunching] = useState(false);
  const questionRefs = useRef<(HTMLElement | null)[]>([]);
  // The question just added: once it renders, it glides into view and takes the cursor.
  const scrollToQuestion = useRef<number | null>(null);
  const questionCount = draft.questions.length;

  useEffect(() => {
    const index = scrollToQuestion.current;
    const added = index === null ? null : questionRefs.current[index];
    if (!added) return;
    scrollToQuestion.current = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    added.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    added.querySelector("input")?.focus({ preventScroll: true });
  }, [questionCount]);
  const kind = CHALLENGE_KINDS[draft.kind];
  const problem = draftProblem(draft);
  const isQuiz = draft.kind === "quiz";

  async function launch(close: () => void) {
    setLaunching(true);
    const launched = await onLaunch(launchableDraft(draft));
    setLaunching(false);
    if (launched) close();
  }

  return (
    <Modal label={`New ${kind.label.toLowerCase()}`} size="lg" locked={launching} onClose={onClose}>
      {(close) => (
        <>
          <header className="bw-overlay__header bw-challenge-bar">
            <button className="bw-back-button" aria-label="Back" onClick={close}>
              ←
            </button>
            <div className="bw-challenge-head">
              <span className="bw-challenge-head__kind">New {kind.label.toLowerCase()}</span>
              <span className="bw-challenge-head__title">
                {isQuiz ? "Every room answers together, at its own pace" : "Every room talks it over and votes once"}
              </span>
            </div>
          </header>

          <ChallengeScrollBody>
            {isQuiz ? <p className="bw-confirm-message">Tap a letter to mark the right answer.</p> : null}
            {isQuiz ? (
              <div className="bw-field">
                <SectionLabel>Quiz title</SectionLabel>
                <input
                  className="bw-goal-input"
                  value={draft.title}
                  autoFocus
                  maxLength={MAX_TITLE_LENGTH}
                  placeholder="Checkout basics"
                  onChange={(event) => onChange({ ...draft, title: event.target.value })}
                />
              </div>
            ) : null}

            {draft.questions.map((question, index) => (
              <section
                className="bw-challenge-question"
                key={index}
                ref={(element) => {
                  questionRefs.current[index] = element;
                }}
              >
                <div className="bw-challenge-question__head">
                  <SectionLabel>{isQuiz ? `Question ${index + 1}` : "Question"}</SectionLabel>
                  <div className="bw-header-spacer" />
                  {isQuiz && draft.questions.length > 1 ? (
                    <button
                      className="bw-icon-button"
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() => onChange(removeQuestion(draft, index))}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
                <input
                  className="bw-goal-input"
                  value={question.text}
                  autoFocus={!isQuiz}
                  maxLength={MAX_QUESTION_LENGTH}
                  placeholder={
                    !isQuiz ? "Which fix should every team try first?" : index === 0 ? "What share of shoppers leave at the shipping step?" : `Question ${index + 1}`
                  }
                  onChange={(event) => onChange(setQuestion(draft, index, { ...question, text: event.target.value }))}
                />
                <div className="bw-challenge-options" role={isQuiz ? "radiogroup" : undefined} aria-label={isQuiz ? "Right answer" : undefined}>
                  {question.options.map((option, optionIndex) => {
                    const isRight = draft.kind === "quiz" && draft.answerKey[index] === optionIndex;
                    return (
                      <div className="bw-challenge-option" key={optionIndex}>
                        {draft.kind === "quiz" ? (
                          <button
                            className="bw-challenge-option__right"
                            role="radio"
                            aria-checked={isRight}
                            title={isRight ? "The right answer" : "Mark as the right answer"}
                            aria-label={`${optionLetter(optionIndex)}: right answer`}
                            onClick={() =>
                              onChange({
                                ...draft,
                                answerKey: draft.answerKey.map((key, at) => (at === index ? optionIndex : key)),
                              })
                            }
                          >
                            {optionLetter(optionIndex)}
                          </button>
                        ) : (
                          <span className="bw-challenge-option__letter">{optionLetter(optionIndex)}</span>
                        )}
                        <input
                          className="bw-challenge-option__input"
                          value={option}
                          maxLength={MAX_OPTION_LENGTH}
                          placeholder={`Option ${optionLetter(optionIndex)}`}
                          aria-label={`Option ${optionLetter(optionIndex)}`}
                          onChange={(event) =>
                            onChange(
                              setQuestion(draft, index, {
                                ...question,
                                options: question.options.map((current, at) => (at === optionIndex ? event.target.value : current)),
                              }),
                            )
                          }
                        />
                        {question.options.length > 2 ? (
                          <button
                            className="bw-icon-button"
                            aria-label={`Remove option ${optionLetter(optionIndex)}`}
                            onClick={() => onChange(removeOption(draft, index, optionIndex))}
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {question.options.length < MAX_CHALLENGE_OPTIONS ? (
                  <Button
                    variant="ghost"
                    className="bw-challenge-question__add"
                    onClick={() => onChange(setQuestion(draft, index, { ...question, options: [...question.options, ""] }))}
                  >
                    + Add option
                  </Button>
                ) : null}
              </section>
            ))}

            {isQuiz && draft.questions.length < MAX_QUIZ_QUESTIONS ? (
              <Button
                variant="secondary"
                size="sm"
                className="bw-challenge-add"
                onClick={() => {
                  scrollToQuestion.current = questionCount;
                  onChange(addQuestion(draft));
                }}
              >
                + Add question
              </Button>
            ) : null}

            <div className="bw-field">
              <SectionLabel>Time to answer</SectionLabel>
              <div className="bw-time-choices" role="radiogroup" aria-label="Time to answer">
                {kind.durations.toSorted((a, b) => a - b).map((seconds) => (
                  <button
                    key={seconds}
                    className="bw-time-choice"
                    role="radio"
                    aria-checked={draft.durationSec === seconds}
                    onClick={() => onChange({ ...draft, durationSec: seconds })}
                  >
                    {formatClock(seconds)}
                  </button>
                ))}
              </div>
            </div>
          </ChallengeScrollBody>

          <footer className="bw-challenge-actionbar">
            <span className="bw-challenge-actionbar__hint">{problem ?? "Ready to launch."}</span>
            <Button
              size="sm"
              disabled={problem !== null}
              title={problem ?? undefined}
              busy={launching}
              onClick={() => void launch(close)}
            >
              Launch to {roomCount} {roomCount === 1 ? "room" : "rooms"}
            </Button>
          </footer>
        </>
      )}
    </Modal>
  );
}
