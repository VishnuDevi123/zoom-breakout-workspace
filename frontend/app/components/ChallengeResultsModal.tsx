"use client";

import { useState } from "react";

import { CHALLENGE_KINDS } from "@/lib/challenges";
import type { ChallengeView } from "@/types/breakout";

import ChallengeLeaderboard from "./ChallengeLeaderboard";
import ChallengeScrollBody from "./ChallengeScrollBody";
import ChallengeTally from "./ChallengeTally";
import { Button, Modal, SectionLabel } from "./ui";

/**
 * The host's live results for one poll or quiz: a quiz's leaderboard, then how
 * every room answered each question. Updates as rooms lock in. Rooms see the
 * same once the host presses Reveal.
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
  const results = challenge.results;

  return (
    <Modal label={`${challenge.title} results`} size="lg" onClose={onClose}>
      {(close) => (
        <>
          <header className="bw-overlay__header bw-challenge-bar">
            <button className="bw-back-button" aria-label="Back" onClick={close}>
              ←
            </button>
            <div className="bw-challenge-head">
              <span className="bw-challenge-head__kind">
                {CHALLENGE_KINDS[challenge.kind].label} results · {challenge.revealed ? "revealed to rooms" : "rooms see them when time is up"}
              </span>
              <span className="bw-challenge-head__title" title={challenge.title}>
                {challenge.title}
              </span>
            </div>
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
          </header>

          <ChallengeScrollBody capped>
            {results && challenge.kind === "quiz" ? (
              <div className="bw-field">
                <SectionLabel>Leaderboard</SectionLabel>
                <ChallengeLeaderboard results={results} questionCount={challenge.questions.length} />
              </div>
            ) : null}
            {results
              ? challenge.questions.map((question, index) => (
                  <ChallengeTally key={index} question={question} index={index} results={results} />
                ))
              : null}
          </ChallengeScrollBody>

        </>
      )}
    </Modal>
  );
}
