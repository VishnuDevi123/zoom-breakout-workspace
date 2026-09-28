"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readRoundTasks, saveRoundTasks } from "@/lib/execution-api";
import type { RoomTask } from "@/types/breakout";

const EMPTY_TASK: RoomTask = { goal: "", instructions: [], resources: [] };

export type TaskEditorState = "loading" | "ready" | "saving" | "error";

/**
 * The host's side of one round's task. `use-participant-round` reads the task
 * a participant should see and never writes; this one owns the edits, the
 * revision and the save, so the two stay separate.
 *
 * Per-room overrides are carried through untouched. No screen writes them yet,
 * but a save must not wipe what the store already holds.
 */
export function useRoundTasks(parentUUID: string, roundId: string) {
  const [task, setTask] = useState<RoomTask>(EMPTY_TASK);
  const [state, setState] = useState<TaskEditorState>("loading");
  const revisionRef = useRef(0);
  const roomsRef = useRef<Record<string, RoomTask>>({});

  useEffect(() => {
    let alive = true;

    async function load(): Promise<RoomTask> {
      if (!parentUUID || !roundId) return EMPTY_TASK;
      const stored = await readRoundTasks(parentUUID, roundId);
      revisionRef.current = stored?.revision ?? 0;
      roomsRef.current = stored?.rooms ?? {};
      return stored?.all ?? EMPTY_TASK;
    }

    void load()
      .then((loaded) => {
        if (!alive) return;
        setTask(loaded);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("error");
      });

    return () => {
      alive = false;
    };
  }, [parentUUID, roundId]);

  /**
   * Writes the whole record. A 409 means another client saved first, so the
   * current revision is read back and the write is retried once; a second
   * conflict is a real collision and is reported.
   */
  const save = useCallback(
    async (next: RoomTask): Promise<boolean> => {
      if (!parentUUID || !roundId) return false;
      setState("saving");

      async function write(): Promise<number> {
        const saved = await saveRoundTasks({
          parentUUID,
          roundId,
          all: next.goal.trim() ? next : null,
          rooms: roomsRef.current,
          expectedRevision: revisionRef.current,
        });
        return saved.revision;
      }

      try {
        revisionRef.current = await write();
      } catch {
        const stored = await readRoundTasks(parentUUID, roundId).catch(() => null);
        revisionRef.current = stored?.revision ?? revisionRef.current;
        try {
          revisionRef.current = await write();
        } catch {
          setState("error");
          return false;
        }
      }

      setState("ready");
      return true;
    },
    [parentUUID, roundId],
  );

  return { task, setTask, state, save };
}
