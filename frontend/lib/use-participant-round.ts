"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { readRoundTasks, readSavedRoundPlan, readWorkspace } from "@/lib/execution-api";
import type { Activity, PlannedRoom, RoomTask } from "@/types/breakout";

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
  /** Round-wide, in the host's order. Empty when none. */
  activities: Activity[];
  /** The round's own title, from the saved draft. */
  roundTitle: string;
  /** 1-based place in the workspace, and how many rounds there are. 0 when unknown. */
  roundPosition: number;
  roundCount: number;
  /** False until the placement and the task for this round have both arrived. */
  ready: boolean;
}

interface Placement {
  /** The round this was read for; a different round means it is still loading. */
  roundId: string;
  room: PlannedRoom | null;
  roundTitle: string;
  roundPosition: number;
  roundCount: number;
}

/** Before the first read finishes. No round id matches null, so nothing counts as loaded. */
const NOT_READ = { roundId: null } as const;

export function useParticipantRound({
  parentUUID,
  participantUUID,
  roundId,
  taskRevision,
  location,
}: {
  parentUUID: string;
  participantUUID: string;
  /** Empty when no round is running. */
  roundId: string;
  /** From LiveState. Every host task save bumps it. */
  taskRevision: number;
  /**
   * The caller's own location from LiveState. The host can place someone mid-round,
   * which saves the plan but pushes nothing; entering the room changes this, so the
   * placement is read again then.
   */
  location: string;
}): ParticipantRound {
  const [placement, setPlacement] = useState<Placement | typeof NOT_READ>(NOT_READ);
  const [task, setTask] = useState<RoomTask | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [taskRoundId, setTaskRoundId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const nowhere: Placement = { roundId, room: null, roundTitle: "", roundPosition: 0, roundCount: 0 };

    async function readPlacement(): Promise<Placement> {
      if (!parentUUID || !roundId || !participantUUID) return nowhere;
      try {
        // Position comes from the workspace's round order, never from the id.
        const [plan, workspace] = await Promise.all([
          readSavedRoundPlan(parentUUID, roundId),
          readWorkspace(parentUUID).catch(() => null),
        ]);
        const rounds = workspace?.rounds ?? [];
        return {
          roundId,
          roundTitle: plan.title,
          roundPosition: rounds.findIndex((r) => r.roundId === roundId) + 1,
          roundCount: rounds.length,
          room: plan.rooms.find((r) => r.participantUUIDs.includes(participantUUID)) ?? null,
        };
      } catch {
        // The host launched before saving a draft for this round.
        return nowhere;
      }
    }

    void readPlacement().then((next) => {
      if (alive) setPlacement(next);
    });

    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, participantUUID, location]);

  const shownPlacement = placement.roundId === roundId ? placement : null;
  const roomId = shownPlacement?.room?.id ?? "";

  /** What is on screen, and for which round and room, so a refetch can say what changed. */
  const shown = useRef<{ key: string; task: RoomTask | null; activities: Activity[] } | null>(null);

  useEffect(() => {
    let alive = true;

    async function readTask(): Promise<{ task: RoomTask | null; activities: Activity[] }> {
      if (!parentUUID || !roundId) return { task: null, activities: [] };
      try {
        const tasks = await readRoundTasks(parentUUID, roundId);
        return {
          task: (roomId ? tasks?.rooms[roomId] : null) ?? tasks?.all ?? null,
          activities: tasks?.activities ?? [],
        };
      } catch {
        return { task: null, activities: [] };
      }
    }

    void readTask().then((next) => {
      if (!alive) return;
      const key = `${roundId}:${roomId}`;
      const previous = shown.current?.key === key ? shown.current : null;
      shown.current = { key, ...next };
      if (previous) announceChanges(previous, next);
      setTask(next.task);
      setActivities(next.activities);
      setTaskRoundId(roundId);
    });

    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, roomId, taskRevision]);

  return {
    room: shownPlacement?.room ?? null,
    task,
    activities,
    roundTitle: shownPlacement?.roundTitle ?? "",
    roundPosition: shownPlacement?.roundPosition ?? 0,
    roundCount: shownPlacement?.roundCount ?? 0,
    ready: shownPlacement !== null && taskRoundId === roundId,
  };
}

/**
 * Toasts for a live host edit, compared with what was on screen in the same
 * round and room. Never on first load: arriving content explains itself.
 * A first task appearing mid-round is an arrival too, so it is not announced.
 */
function announceChanges(
  previous: { task: RoomTask | null; activities: Activity[] },
  next: { task: RoomTask | null; activities: Activity[] },
): void {
  const known = new Set(previous.activities.map((activity) => activity.id));
  for (const activity of next.activities) {
    if (!known.has(activity.id)) toast("New activity from your host", { description: activity.title });
  }
  if (previous.task && JSON.stringify(previous.task) !== JSON.stringify(next.task)) {
    toast("Host updated the task");
  }
}
