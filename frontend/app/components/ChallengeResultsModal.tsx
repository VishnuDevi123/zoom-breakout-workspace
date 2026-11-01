"use client";

import { useState } from "react";

import { CHALLENGE_KINDS } from "@/lib/challenges";
import { formatClock, useRemainingSec } from "@/lib/round-clock";
import type { ChallengeView } from "@/types/breakout";

import ChallengeLeaderboard from "./ChallengeLeaderboard";
import ChallengeScrollBody from "./ChallengeScrollBody";
import ChallengeTally from "./ChallengeTally";
import { Button, Modal, SectionLabel } from "./ui";

/**
 * The host's results for one poll or quiz, live while it runs and kept after
 * the reveal. The title leads (a poll's title is its question), then a quiz's
 * leaderboard, then how every room answered each question.
 */
export default function ChallengeResultsModal({
  challenge,
  onReveal,
  onClose,
}: {
  challenge: ChallengeView;
  onReveal: () => Promise<void>;
  onClose: () => void;
}) {
  const [revealing, setRevealing] = useState(false);
  const remainingSec = useRemainingSec(challenge.revealed ? 0 : challenge.endsAt);
  const results = challenge.results;
  const isQuiz = challenge.kind === "quiz";

  return (
    <Modal label={`${challenge.title} results`} size="lg" panelClassName={`bw-challenge-panel bw-challenge-panel--${challenge.kind}`} onClose={onClose}>
      {(close) => (
        <>
          <header className="bw-overlay__header bw-challenge-bar">
            <span className={`bw-challenge-badge bw-challenge-badge--${challenge.kind}`}>
              {CHALLENGE_KINDS[challenge.kind].label}
            </span>
            {challenge.revealed ? (
              <span className="bw-challenge-bar__status">Revealed to rooms</span>
            ) : remainingSec ? (
              <span className="bw-challenge-bar__clock bw-mono">{formatClock(remainingSec)} left</span>
            ) : null}
            <div className="bw-header-spacer" />
            {challenge.revealed ? null : (
              <Button
                size="sm"
                busy={revealing}
                onClick={async () => {
                  setRevealing(true);
                  await onReveal();
                  setRevealing(false);
                }}
              >
                Reveal now
              </Button>
            )}
            <button className="bw-back-button" aria-label="Close" title="Close" onClick={close}>
              ✕
            </button>
          </header>

          <ChallengeScrollBody>
            <h2 className="bw-challenge-results__title">{challenge.title}</h2>
            {results && isQuiz ? (
              <div className="bw-field">
                <SectionLabel>Leaderboard</SectionLabel>
                <ChallengeLeaderboard results={results} questionCount={challenge.questions.length} />
              </div>
            ) : null}
            {results
              ? challenge.questions.map((question, index) => (
                  <ChallengeTally key={index} question={question} index={index} results={results} hideQuestion={!isQuiz} />
                ))
              : null}
          </ChallengeScrollBody>
        </>
      )}
    </Modal>
  );
}
