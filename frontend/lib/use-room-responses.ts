"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  addIdea,
  editIdea,
  readRoomResponses,
  removeIdea,
  saveAnswer,
  saveTick,
} from "@/lib/execution-api";
import type { AnswerStatus, RoomResponsesView } from "@/types/breakout";

/**
 * What the participant's room has written: notes, checklist ticks,
 * their own answers and everyone's answer status.
 *
 * Separate from `use-participant-round`, which reads what the host wrote (task,
 * activities) and refetches on `taskRevision`. This refetches on the room's own
 * counter, `LiveState.roomRevisions[roomId]`, which every response write bumps.
 */
export function useRoomResponses({
  parentUUID,
  roundId,
  roomId,
  participantUUID,
  roomRevision,
}: {
  parentUUID: string;
  roundId: string;
  roomId: string;
  participantUUID: string;
  roomRevision: number;
}) {
  const [view, setView] = useState<RoomResponsesView | null>(null);

  useEffect(() => {
    let alive = true;
    if (!parentUUID || !roundId || !roomId || !participantUUID) return;

    readRoomResponses(parentUUID, roundId, roomId, participantUUID)
      .then((next) => {
        if (alive) setView(next);
      })
      .catch(() => {
        // Keep what is on screen; the next counter bump retries.
      });

    return () => {
      alive = false;
    };
  }, [parentUUID, roundId, roomId, participantUUID, roomRevision]);

  /**
   * Every write returns the caller's fresh view; the room's other members refetch
   * on the counter. Takes a thunk so a failure to start the request is caught too.
   */
  const write = useCallback(async (send: () => Promise<RoomResponsesView>): Promise<boolean> => {
    try {
      setView(await send());
      return true;
    } catch (error) {
      toast.error("Could not save.", {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    }
  }, []);

  const caller = { parentUUID, participantUUID };

  return {
    view,
    setTick: (itemId: string, done: boolean) =>
      write(() => saveTick(roundId, roomId, itemId, { ...caller, done })),
    saveAnswer: (activityId: string, text: string, status: AnswerStatus) =>
      write(() => saveAnswer(roundId, roomId, activityId, { ...caller, text, status })),
    addIdea: (activityId: string, description: string) =>
      write(() => addIdea(roundId, roomId, activityId, { ...caller, description })),
    editIdea: (activityId: string, noteId: string, title: string, description: string) =>
      write(() => editIdea(roundId, roomId, activityId, noteId, { ...caller, title, description })),
    removeIdea: (activityId: string, noteId: string) =>
      write(() => removeIdea(roundId, roomId, activityId, noteId, caller)),
  };
}
