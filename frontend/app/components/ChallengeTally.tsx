import type { CSSProperties } from "react";

import { optionLetter, roomsChoosing } from "@/lib/challenges";
import type { ChallengeQuestion, ChallengeResults, RoomChallengeResult } from "@/types/breakout";

import { StatusDot } from "./ui";

/**
 * How rooms answered one question. The host sees a bar per option and every
 * room that chose it. A room sees its own answer: in a quiz the right option is
 * green and a wrong pick by the room red, with no other rooms shown; in a poll a
 * bar per option, "Your room", and a count of the others.
 */
export default function ChallengeTally({
  question,
  index,
  results,
  ownRoomId,
  hideQuestion = false,
}: {
  question: ChallengeQuestion;
  index: number;
  results: ChallengeResults;
  /** The viewer's room; absent for the host. */
  ownRoomId?: string;
  /** The caller already shows the question (a poll's results card). */
  hideQuestion?: boolean;
}) {
  const roomCount = Math.max(1, results.rooms.length);
  const right = results.answerKey?.[index];
  const isQuiz = results.answerKey !== null;
  const ownAnswer = results.rooms.find((room) => room.roomId === ownRoomId)?.answers[index] ?? null;

  return (
    <section className="bw-tally">
      {hideQuestion ? null : (
        <p className="bw-tally__question">
          {isQuiz ? `${index + 1}. ` : ""}
          {question.text}
        </p>
      )}
      <ul className="bw-tally__options">
        {question.options.map((option, optionIndex) => {
          const rooms = roomsChoosing(results, index, optionIndex);
          const isRight = right === optionIndex;
          if (isQuiz && ownRoomId !== undefined) {
            const isOwn = ownAnswer === optionIndex;
            const tone = isRight ? " bw-tally__option--right-solid" : isOwn ? " bw-tally__option--wrong" : "";
            return (
              <li key={optionIndex} className={`bw-tally__option${tone}`}>
                {/* A shape as well as a colour, so a green or red room still tells right from wrong. */}
                {isRight ? <span className="bw-tally__icon bw-tally__icon--right" aria-label="Right">✓</span> : null}
                {isOwn && !isRight ? <span className="bw-tally__icon bw-tally__icon--wrong" aria-label="Wrong">✕</span> : null}
                <span className="bw-tally__letter">{optionLetter(optionIndex)}</span>
                <span className="bw-tally__text">{option}</span>
                {isOwn ? <span className="bw-tally__mark">Your room&apos;s answer</span> : null}
                {isRight && !isOwn ? <span className="bw-tally__mark">Right answer</span> : null}
              </li>
            );
          }
          const ownPick = ownRoomId !== undefined && rooms.some((room) => room.roomId === ownRoomId);
          return (
            <li
              key={optionIndex}
              className={`bw-tally__option${isRight ? " bw-tally__option--right" : ""}${ownPick ? " bw-tally__option--own" : ""}`}
              style={{ "--bw-share": `${(rooms.length / roomCount) * 100}%` } as CSSProperties}
            >
              {isRight ? <span className="bw-tally__icon bw-tally__icon--right" aria-label="Right answer" title="Right answer">✓</span> : null}
              <span className="bw-tally__letter">{optionLetter(optionIndex)}</span>
              <span className="bw-tally__text">{option}</span>
              {ownRoomId === undefined ? (
                <span className="bw-tally__rooms">
                  {rooms.map((room) => (
                    <span key={room.roomId} className="bw-tally__room" title={room.name}>
                      <StatusDot color={room.dot} />
                      <span className="bw-tally__room-name">{room.name}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <OwnRoomTally rooms={rooms} ownRoomId={ownRoomId} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Poll: how many rooms chose this option, with a check when the viewer's room is one of them. No names. */
function OwnRoomTally({ rooms, ownRoomId }: { rooms: RoomChallengeResult[]; ownRoomId: string }) {
  const own = rooms.some((room) => room.roomId === ownRoomId);
  return (
    <span className="bw-tally__rooms">
      <span className={own ? "bw-tally__room bw-tally__room--own" : "bw-tally__room"}>
        {own ? "✓ " : ""}
        {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
      </span>
    </span>
  );
}
