"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { readRoundTasks, readSavedRoundPlan } from "@/lib/execution-api";
import type { PlannedRoom, RoomTask } from "@/types/breakout";

/**
 * What one participant needs to see for the running round.
 *
 * Room membership comes from the host's saved draft, not from Zoom: the client
 * never reads breakout state, and the backend only learns a room's Zoom UUID
 * once somebody enters it. `use-round-summaries` reads every round for the
 * host's review rail; this reads one round for one person, and refetches the
 * task on its own trigger, so the two do not collapse into one hook.
 */
export interface ParticipantRound {
  /** Null while loading, and when this participant stays in the main meeting. */
  room: PlannedRoom | null;
  /** Per-room override, else the round-level task, else null. */
  task: RoomTask | null;
  /** The round's own title, from the saved draft. */
  roundTitle: string;
}

interface Placement {
  room: PlannedRoom | null;
  roundTitle: string;
}

const NOWHERE: Placement = { room: null, roundTitle: "" };

export function useParticipantRound({
  parentUUID,
  participantUUID,
  roundId,
  taskRevision,
}: {
  parentUUID: string;
  participantUUID: string;
  /** Empty when no round is running. */
  roundId: string;
  /** From LiveState. Every host task save bumps it. */
  taskRevision: number;
}): ParticipantRound {
  const [placement, setPlacement] = useState<Placement>(NOWHERE);
  const [task, setTask] = useState<RoomTask | null>(null);

  useEffect(() => {
    let alive = true;

    async function readPlacement(): Promise<Placement> {
      if (!parentUUID || !roundId || !participantUUID) return NOWHERE;
      try {
        const plan = await readSavedRoundPlan(parentUUID, roundId);
        return {
          roundTitle: plan.title,
          room: plan.rooms.find((r) => r.participantUUIDs.includes(participantUUID)) ?? null,
        };
      } catch {
        // The host launched before saving a draft for this round.
        return NOWHERE;
      }
    }

    void readPlacement().then((next) => {
      if (alive) setPlacement(next);
    });

    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, participantUUID]);

  const roomId = placement.room?.id ?? "";

  /** True while a task is on screen, so the toast below can tell a change from an arrival. */
  const taskOnScreen = useRef(false);

  useEffect(() => {
    let alive = true;

    async function readTask(): Promise<RoomTask | null> {
      if (!parentUUID || !roundId) return null;
      try {
        const tasks = await readRoundTasks(parentUUID, roundId);
        return (roomId ? tasks?.rooms[roomId] : null) ?? tasks?.all ?? null;
      } catch {
        return null;
      }
    }

    void readTask().then((next) => {
      if (!alive) return;
      taskOnScreen.current = next !== null;
      setTask(next);
    });

    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, roomId, taskRevision]);

  // Announce a live edit, never the first task of the round: arriving content
  // explains itself, changed content does not. This runs before the fetch above
  // resolves, so it still sees whether something was already displayed.
  const announcedRevision = useRef(taskRevision);

  useEffect(() => {
    if (announcedRevision.current === taskRevision) return;
    announcedRevision.current = taskRevision;
    if (taskOnScreen.current) toast("Host updated the task");
  }, [taskRevision]);

  return { room: placement.room, task, roundTitle: placement.roundTitle };
}
