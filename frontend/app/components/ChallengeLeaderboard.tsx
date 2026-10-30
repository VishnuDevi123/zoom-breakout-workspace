import { placeLabel, placeOf, quizWinners } from "@/lib/challenges";
import type { ChallengeResults } from "@/types/breakout";

import { StatusDot } from "./ui";

/**
 * A quiz's rooms, best first. Rooms on the same score share a place; the earlier finish is listed first.
 * Winners are highlighted. The host sees every score; a room sees the ranking
 * but only its own score.
 */
export default function ChallengeLeaderboard({
  results,
  questionCount,
  ownRoomId,
}: {
  results: ChallengeResults;
  questionCount: number;
  /** The viewer's room, marked "you", and the only score it sees; absent for the host. */
  ownRoomId?: string;
}) {
  const winners = new Set(quizWinners(results).map((room) => room.roomId));

  return (
    <ol className="bw-leaderboard">
      {results.rooms.map((room) => {
        const showScore = ownRoomId === undefined || room.roomId === ownRoomId;
        return (
          <li
            key={room.roomId}
            className={winners.has(room.roomId) ? "bw-leaderboard__row bw-leaderboard__row--winner" : "bw-leaderboard__row"}
          >
            <span className="bw-leaderboard__place">{placeLabel(placeOf(results, room))}</span>
            <StatusDot color={room.dot} />
            <span className="bw-leaderboard__name" title={room.name}>
              {room.name}
              {room.roomId === ownRoomId ? <span className="bw-leaderboard__you"> · you</span> : null}
            </span>
            {showScore ? (
              <>
                <span className="bw-leaderboard__meta">{room.finishedAt === null ? "Not finished" : null}</span>
                <span className="bw-leaderboard__score bw-mono">
                  {room.correct}/{questionCount}
                </span>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
