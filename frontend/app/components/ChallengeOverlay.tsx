"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { CHALLENGE_KINDS, currentQuestion, placeLabel, placeOf, winnerHeadline } from "@/lib/challenges";
import { initialsFrom } from "@/lib/participant-status";
import { formatClock, useRemainingSec } from "@/lib/round-clock";
import type { ChallengeView, LiveParticipant, RoomChallengeAnswers } from "@/types/breakout";

import ChallengeLeaderboard from "./ChallengeLeaderboard";
import ChallengeScrollBody from "./ChallengeScrollBody";
import ChallengeTally from "./ChallengeTally";
import { Button, Modal } from "./ui";

/** How long "Incoming" shows before the poll or quiz itself. Matches bwIncoming in globals.css. */
const INTRO_MS = 1600;

/**
 * A poll or quiz the host launched, as a card over the room page. It opens with
 * a short "Incoming" card, then the room answers one question at a time: every
 * tap is a suggestion, shown live as the people's initials and a bar filling to
 * the room's share on that option, and anyone can lock in the room's answer.
 * Results arrive by themselves when time is up, or earlier if the host reveals.
 */
export default function ChallengeOverlay({
  challenge,
  answers,
  roomId,
  roomName,
  participants,
  participantUUID,
  intro,
  onIntroDone,
  onAnswer,
  onClose,
}: {
  challenge: ChallengeView;
  answers: RoomChallengeAnswers;
  roomId: string;
  roomName: string;
  /** For the names behind each suggestion's initials. */
  participants: LiveParticipant[];
  participantUUID: string;
  /** Play the "Incoming" card first: true the first time this challenge shows. */
  intro: boolean;
  /** Called with the challenge id once the card has shown. Must be stable (a state setter), or the timer restarts. */
  onIntroDone: (challengeId: string) => void;
  onAnswer: (part: "pick" | "lock", question: number, option: number) => Promise<void>;
  onClose: () => void;
}) {
  const kind = CHALLENGE_KINDS[challenge.kind];
  const isQuiz = challenge.kind === "quiz";

  useEffect(() => {
    if (!intro) return;
    const timer = setTimeout(() => onIntroDone(challenge.id), INTRO_MS);
    return () => clearTimeout(timer);
  }, [intro, onIntroDone, challenge.id]);

  return (
    <Modal label={`${kind.label}: ${challenge.title}`} panelClassName="bw-play" onClose={onClose}>
      {(close) =>
        intro ? (
          <div className="bw-incoming" aria-live="polite">
            <span className="bw-incoming__label">Incoming</span>
            <span className="bw-incoming__kind">{kind.label}</span>
            <span className="bw-incoming__title">{challenge.title}</span>
            <span className="bw-incoming__bar" />
          </div>
        ) : (
          <>
            <header className="bw-play__bar">
              <button className="bw-back-button" aria-label="Back to the room" onClick={close}>
                ←
              </button>
              {/* A poll's title is its question, shown large below; a quiz names itself here once. */}
              <span className="bw-play__label" title={challenge.title}>
                {kind.label}
                {challenge.revealed ? " results" : ""}
                {isQuiz ? ` · ${challenge.title}` : ""}
              </span>
              {challenge.revealed ? null : <TimeLeft endsAt={challenge.endsAt} />}
            </header>
            <ChallengeScrollBody capped={challenge.revealed}>
              {challenge.revealed && challenge.results ? (
                <Revealed challenge={challenge} roomId={roomId} />
              ) : (
                <Answering
                  challenge={challenge}
                  answers={answers}
                  roomName={roomName}
                  participants={participants}
                  participantUUID={participantUUID}
                  onAnswer={onAnswer}
                />
              )}
            </ChallengeScrollBody>
          </>
        )
      }
    </Modal>
  );
}

function TimeLeft({ endsAt }: { endsAt: number }) {
  const remainingSec = useRemainingSec(endsAt) ?? 0;
  return (
    <span className={remainingSec > 0 && remainingSec <= 10 ? "bw-play__clock bw-play__clock--low" : "bw-play__clock"}>
      {remainingSec > 0 ? formatClock(remainingSec) : "Time's up"}
    </span>
  );
}

/** The room's current question with live suggestions, or the wait for the results. */
function Answering({
  challenge,
  answers,
  roomName,
  participants,
  participantUUID,
  onAnswer,
}: {
  challenge: ChallengeView;
  answers: RoomChallengeAnswers;
  roomName: string;
  participants: LiveParticipant[];
  participantUUID: string;
  onAnswer: (part: "pick" | "lock", question: number, option: number) => Promise<void>;
}) {
  const [locking, setLocking] = useState(false);
  const remainingSec = useRemainingSec(challenge.endsAt) ?? 0;
  const index = currentQuestion(answers);
  const total = challenge.questions.length;
  const lockedCount = answers.locks.filter((lock) => lock !== null).length;

  if (index === -1 || remainingSec === 0) {
    return (
      <div className="bw-play__wait bw-swap-in">
        <span className="bw-play__wait-title">{index === -1 ? "Locked in" : "Time's up"}</span>
        <span className="bw-play__wait-hint">
          {index === -1 ? "Results appear here when time is up." : "Results are on their way."}
        </span>
      </div>
    );
  }

  const question = challenge.questions[index];
  const picks = answers.picks[index] ?? {};
  const pickCount = Math.max(1, Object.keys(picks).length);
  const myPick = picks[participantUUID];
  const nameOf = (uuid: string) => participants.find((p) => p.participantUUID === uuid)?.name || "Participant";

  async function lock(option: number) {
    setLocking(true);
    await onAnswer("lock", index, option);
    setLocking(false);
  }

  return (
    <div className="bw-play__answer" key={index}>
      {total > 1 ? (
        <div className="bw-play__progress" aria-label={`Question ${index + 1} of ${total}`}>
          {challenge.questions.map((_, position) => (
            <span
              key={position}
              className={
                position < index
                  ? "bw-play__step bw-play__step--done"
                  : position === index
                    ? "bw-play__step bw-play__step--now"
                    : "bw-play__step"
              }
            />
          ))}
          <span className="bw-play__step-count">
            {index + 1}/{total}
          </span>
        </div>
      ) : null}
      <p className="bw-play__question">{question.text}</p>
      <div className="bw-play__options">
        {question.options.map((option, optionIndex) => {
          const leaning = Object.entries(picks).filter(([, picked]) => picked === optionIndex).map(([uuid]) => uuid);
          const mine = myPick === optionIndex;
          return (
            <button
              key={optionIndex}
              className="bw-play__option"
              aria-pressed={mine}
              style={{ "--bw-share": `${(leaning.length / pickCount) * 100}%` } as CSSProperties}
              onClick={() => void onAnswer("pick", index, optionIndex)}
            >
              <span className="bw-play__option-text">{option}</span>
              <span className="bw-play__who">
                {leaning.map((uuid) => (
                  <span key={uuid} className="bw-play__initials" title={nameOf(uuid)}>
                    {initialsFrom(nameOf(uuid))}
                  </span>
                ))}
              </span>
              {mine ? <span className="bw-play__check" aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
      <div className="bw-play__actions">
        {/* Said once: before the room's first lock, while nobody has picked yet. */}
        <span className="bw-play__hint">
          {lockedCount === 0 && myPick === undefined ? "Talk it over. Anyone in the room can lock in." : null}
        </span>
        <Button
          size="sm"
          className="bw-play__lock"
          disabled={myPick === undefined}
          busy={locking}
          title={`Lock in the answer for ${roomName}`}
          onClick={() => myPick !== undefined && void lock(myPick)}
        >
          {myPick === undefined ? "Pick to lock in" : "Lock in"}
        </Button>
      </div>
    </div>
  );
}

/** The results: a poll's room counts; a quiz's winner, this room's score, the leaderboard and its answers. */
function Revealed({ challenge, roomId }: { challenge: ChallengeView; roomId: string }) {
  const results = challenge.results;
  if (!results) return null;
  const total = challenge.questions.length;

  if (challenge.kind === "poll") {
    return (
      <div className="bw-play__answer bw-swap-in">
        <p className="bw-play__question">{challenge.questions[0].text}</p>
        <ChallengeTally question={challenge.questions[0]} index={0} results={results} ownRoomId={roomId} hideQuestion />
      </div>
    );
  }

  const own = results.rooms.find((room) => room.roomId === roomId);
  // Rooms on the same score share the place.
  const tied = own ? results.rooms.some((room) => room.roomId !== own.roomId && room.correct === own.correct) : false;

  return (
    <div className="bw-play__answer bw-swap-in">
      <div className="bw-play__score">
        <span className="bw-play__score-title">{winnerHeadline(results, roomId)}</span>
        {own ? (
          <span className="bw-play__score-hint">
            {own.correct} of {total} right · {tied ? "joint " : ""}
            {placeLabel(placeOf(results, own))} of {results.rooms.length}
          </span>
        ) : null}
      </div>
      <ChallengeLeaderboard results={results} questionCount={total} ownRoomId={roomId} />
      {challenge.questions.map((question, index) => (
        <ChallengeTally key={index} question={question} index={index} results={results} ownRoomId={roomId} />
      ))}
    </div>
  );
}
