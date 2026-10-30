"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  launchChallenge,
  lockChallengeAnswer,
  pickChallengeOption,
  readChallengesForHost,
  readRoomChallenge,
  revealChallenge,
} from "@/lib/execution-api";
import type { ChallengeDraft, ChallengeView } from "@/types/breakout";

/** Runs one write, reports a failure as a toast, and says whether it worked. */
async function attempt<T>(failure: string, send: () => Promise<T>): Promise<T | null> {
  try {
    return await send();
  } catch (error) {
    toast.error(failure, { description: error instanceof Error ? error.message : undefined });
    return null;
  }
}

/**
 * The host's polls and quizzes for the shown round, with live results.
 * `refreshKey` changes on every launch, reveal, pick or lock (the meeting's
 * challenge counter plus the room counters), and each change refetches.
 */
export function useRoundChallenges({
  parentUUID,
  roundId,
  refreshKey,
}: {
  parentUUID: string;
  roundId: string;
  refreshKey: string;
}) {
  const [loaded, setLoaded] = useState<{ roundId: string; challenges: ChallengeView[] } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!parentUUID || !roundId) return;
    readChallengesForHost(parentUUID, roundId)
      .then((challenges) => {
        if (alive) setLoaded({ roundId, challenges });
      })
      .catch(() => {
        // Keep what is on screen; the next counter bump retries.
      });
    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, refreshKey]);

  // Another round's list must not show while this one loads.
  const challenges = loaded?.roundId === roundId ? loaded.challenges : [];

  async function launch(draft: ChallengeDraft): Promise<boolean> {
    const next = await attempt("Could not launch.", () => launchChallenge(parentUUID, roundId, draft));
    if (next) setLoaded({ roundId, challenges: next });
    return Boolean(next);
  }

  async function reveal(challengeId: string): Promise<void> {
    const next = await attempt("Could not reveal.", () => revealChallenge(parentUUID, roundId, challengeId));
    if (next) setLoaded({ roundId, challenges: next });
  }

  return { latest: challenges.at(-1) ?? null, launch, reveal };
}

/**
 * The round's latest poll or quiz as one room member sees it. Refetches when the
 * host launches or reveals (challenge counter) and when anyone in the room picks
 * or locks (the room's counter).
 */
export function useRoomChallenge({
  parentUUID,
  roundId,
  roomId,
  participantUUID,
  refreshKey,
}: {
  parentUUID: string;
  roundId: string;
  roomId: string;
  participantUUID: string;
  refreshKey: string;
}) {
  const [loaded, setLoaded] = useState<{ roundId: string; challenge: ChallengeView | null } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!parentUUID || !roundId || !roomId || !participantUUID) return;
    readRoomChallenge(parentUUID, roundId, roomId, participantUUID)
      .then((challenge) => {
        if (alive) setLoaded({ roundId, challenge });
      })
      .catch(() => {
        // Keep what is on screen; the next counter bump retries.
      });
    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, roomId, participantUUID, refreshKey]);

  // A challenge read in an earlier round never shows in this one.
  const challenge = loaded?.roundId === roundId ? loaded.challenge : null;

  /** A suggestion ("pick") or the room's final answer ("lock") for one question. */
  async function answer(part: "pick" | "lock", question: number, option: number): Promise<void> {
    if (!challenge) return;
    const request = { parentUUID, participantUUID, option };
    const send = part === "pick" ? pickChallengeOption : lockChallengeAnswer;
    const next = await attempt(part === "pick" ? "Could not save your pick." : "Could not lock in.", () =>
      send(roundId, challenge.id, roomId, question, request),
    );
    if (next) setLoaded({ roundId, challenge: next });
  }

  return { challenge, answer };
}
