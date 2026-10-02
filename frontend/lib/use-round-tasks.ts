"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, readRoundTasks, saveRoundTasks } from "@/lib/execution-api";
import type { Activity, RoomTask, RoundTasks } from "@/types/breakout";

const EMPTY_TASK: RoomTask = { goal: "", instructions: [], resources: [], checklist: [] };

export type TaskEditorState = "loading" | "ready" | "saving" | "error";

/** What one save sends besides the ids: the round's task and its activities. */
interface TaskDraft {
  task: RoomTask;
  activities: Activity[];
}

/**
 * The host's side of one round's task and activities. `use-participant-round`
 * reads what a participant should see and never writes; this one owns the
 * edits, the revision and the save, so the two stay separate.
 *
 * Per-room overrides are carried through untouched. No screen writes them yet,
 * but a save must not wipe what the store already holds.
 *
 * Saves run one at a time: a blur save and a click right after it would
 * otherwise both send the same revision, and the second would conflict with
 * this client's own first write.
 */
export function useRoundTasks(parentUUID: string, roundId: string) {
  const [task, setTask] = useState<RoomTask>(EMPTY_TASK);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [state, setState] = useState<TaskEditorState>("loading");
  const revisionRef = useRef(0);
  const roomsRef = useRef<Record<string, RoomTask>>({});
  // The last draft sent, so saving one half keeps the other half as it was.
  const draftRef = useRef<TaskDraft>({ task: EMPTY_TASK, activities: [] });
  const queueRef = useRef<Promise<boolean>>(Promise.resolve(true));

  const apply = useCallback((stored: RoundTasks | null) => {
    revisionRef.current = stored?.revision ?? 0;
    roomsRef.current = stored?.rooms ?? {};
    draftRef.current = { task: stored?.all ?? EMPTY_TASK, activities: stored?.activities ?? [] };
    setTask(draftRef.current.task);
    setActivities(draftRef.current.activities);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = parentUUID && roundId ? readRoundTasks(parentUUID, roundId) : Promise.resolve(null);

    load
      .then((stored) => {
        if (!alive) return;
        apply(stored);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("error");
      });

    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, apply]);

  /**
   * Writes the whole record. A 409 means someone else saved first: their
   * version is loaded and shown, and this edit is dropped rather than written
   * over theirs.
   */
  const write = useCallback(
    async (patch: Partial<TaskDraft>): Promise<boolean> => {
      if (!parentUUID || !roundId) return false;
      const next = { ...draftRef.current, ...patch };
      setState("saving");

      try {
        const saved = await saveRoundTasks({
          parentUUID,
          roundId,
          all: next.task.goal.trim() ? next.task : null,
          rooms: roomsRef.current,
          activities: next.activities,
          expectedRevision: revisionRef.current,
        });
        revisionRef.current = saved.revision;
        draftRef.current = next;
        setState("ready");
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          apply(await readRoundTasks(parentUUID, roundId).catch(() => null));
          toast.error("Someone else changed this round.", {
            description: "Your edit was not saved. Check it and try again.",
          });
          setState("ready");
          return false;
        }
        toast.error("Could not save.", {
          description: error instanceof Error ? error.message : undefined,
        });
        setState("error");
        return false;
      }
    },
    [parentUUID, roundId, apply],
  );

  const enqueue = useCallback(
    (patch: Partial<TaskDraft>): Promise<boolean> => {
      const run = queueRef.current.then(() => write(patch));
      queueRef.current = run;
      return run;
    },
    [write],
  );

  const save = useCallback((next: RoomTask) => enqueue({ task: next }), [enqueue]);

  const saveActivities = useCallback(
    async (next: Activity[]): Promise<boolean> => {
      const previous = activities;
      setActivities(next);
      const saved = await enqueue({ activities: next });
      if (!saved) setActivities((current) => (current === next ? previous : current));
      return saved;
    },
    [activities, enqueue],
  );

  return { task, setTask, activities, state, save, saveActivities };
}
