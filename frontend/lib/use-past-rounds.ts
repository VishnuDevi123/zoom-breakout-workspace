"use client";

import { useEffect, useState } from "react";

import { readRoomResponses, readRoundTasks, readSavedRoundPlan, readWorkspace } from "@/lib/execution-api";
import type { Activity, PlannedRoom, RoomResponsesView, RoomTask } from "@/types/breakout";

export interface EarlierRound {
  roundId: string;
  /** "Round 2 · Icebreakers", or "Round 2" when the host left it untitled. */
  label: string;
}

/** One past round as the participant left it. Read once, when they open it. */
export type PastRound =
  | { kind: "notPlaced" }
  | { kind: "placed"; room: PlannedRoom; task: RoomTask | null; activities: Activity[]; view: RoomResponsesView };

/**
 * Rounds that have run in this workflow, oldest first. Only titles and statuses
 * are read here; a round's own data waits until it is opened. `liveRoundId`
 * changes on every launch and close, which is when the list can change.
 */
export function useEarlierRounds(parentUUID: string, liveRoundId: string): EarlierRound[] {
  const [rounds, setRounds] = useState<EarlierRound[]>([]);

  useEffect(() => {
    let alive = true;
    readWorkspace(parentUUID)
      .then((workspace) => {
        if (!alive) return;
        const closed = (workspace?.rounds ?? []).flatMap((round, index) =>
          round.status === "closed"
            ? [{ roundId: round.roundId, label: `Round ${index + 1}${round.title ? ` · ${round.title}` : ""}` }]
            : [],
        );
        setRounds(closed);
      })
      // The list is extra: without it the page still works, so a failed read leaves it empty.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [parentUUID, liveRoundId]);

  return rounds;
}

/**
 * Everything a participant may see of one past round: their room from the
 * plan, the task and activities, and the room's responses (own answers, every
 * note, the ticks). The same reads the live room uses, for a round that is over.
 */
export async function readPastRound(parentUUID: string, roundId: string, participantUUID: string): Promise<PastRound> {
  const plan = await readSavedRoundPlan(parentUUID, roundId);
  const room = plan.rooms.find((candidate) => candidate.participantUUIDs.includes(participantUUID));
  if (!room) return { kind: "notPlaced" };

  const [tasks, view] = await Promise.all([
    readRoundTasks(parentUUID, roundId),
    readRoomResponses(parentUUID, roundId, room.id, participantUUID),
  ]);
  // A per-room task wins over the round's, as in the live room.
  const task = tasks?.rooms[room.id] ?? tasks?.all ?? null;
  return { kind: "placed", room, task, activities: tasks?.activities ?? [], view };
}
