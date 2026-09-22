"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ROOM_DOTS,
  type ApiResponse,
  type PlannedRoom,
  type RoundPlan,
  type RoundPlanDraft,
  type SaveRoundPlanRequest,
} from "@/types/breakout";
import {
  assignParticipantToRoom,
  autoAssignParticipantsEvenly,
  clearParticipantPlacement,
  keepParticipantInMain as keepInMain,
} from "@/lib/room-plan-assignments";

const MAX_ROOMS = 50;
const SAVE_DELAY_MS = 500;

export interface SelectedRound {
  roundId: string;
  title: string;
}

export type DraftSaveState =
  | { kind: "saved" }
  | { kind: "saving" }
  | { kind: "error"; message: string; conflict: boolean };

export type RoomPlanState =
  | { kind: "loading" }
  | { kind: "load-error"; message: string }
  | { kind: "ready"; draft: RoundPlanDraft; save: DraftSaveState };

interface CachedDraft {
  draft: RoundPlanDraft;
  revision: number;
  savedFingerprint: string;
  save: DraftSaveState;
}

// Keeps unsaved work alive while future navigation remounts the editor.
const draftCache = new Map<string, CachedDraft>();

/** Next room in a draft: first free "Room N" name and the next dot in the palette. */
export function newRoom(rooms: PlannedRoom[]): PlannedRoom {
  const usedNames = new Set(rooms.map((room) => room.name.trim().toLowerCase()));
  let number = 1;
  while (usedNames.has(`room ${number}`)) number += 1;

  return {
    id: crypto.randomUUID(),
    name: `Room ${number}`,
    dot: ROOM_DOTS[rooms.length % ROOM_DOTS.length],
    participantUUIDs: [],
  };
}

function fingerprint(draft: RoundPlanDraft): string {
  return JSON.stringify(draft);
}

function isDirty(entry: CachedDraft): boolean {
  return fingerprint(entry.draft) !== entry.savedFingerprint;
}

function draftFromPlan(plan: RoundPlan): RoundPlanDraft {
  return {
    parentUUID: plan.parentUUID,
    roundId: plan.roundId,
    title: plan.title,
    rooms: plan.rooms,
    stayInMainParticipantUUIDs: plan.stayInMainParticipantUUIDs ?? [],
  };
}

async function readError(response: Response): Promise<string> {
  try {
    const result = (await response.json()) as ApiResponse<never>;
    if (!result.success) return result.error;
  } catch {
    // Infrastructure errors may return HTML or an empty response.
  }
  return `Backend returned ${response.status}.`;
}

async function isConfirmedMissing(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;
  try {
    const result = (await response.json()) as ApiResponse<never>;
    return !result.success && result.error === "No saved draft for this round.";
  } catch {
    return false;
  }
}

/**
 * Loads and autosaves one round draft without touching live Zoom rooms.
 * `seed` runs only when no draft is saved yet; null falls back to one empty room.
 */
export function useRoomPlan(
  parentUUID: string,
  selectedRound: SelectedRound,
  seed?: () => Promise<RoundPlanDraft | null>,
) {
  const key = `${parentUUID}\u0000${selectedRound.roundId}`;
  const seedRef = useRef(seed);
  const initialCache = draftCache.get(key);
  const preservedInitial = initialCache && isDirty(initialCache) ? initialCache : null;
  const [state, setState] = useState<RoomPlanState>(() =>
    preservedInitial
      ? { kind: "ready", draft: preservedInitial.draft, save: preservedInitial.save }
      : { kind: "loading" },
  );
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [savedRevision, setSavedRevision] = useState(preservedInitial?.revision ?? 0);

  const keyRef = useRef(key);
  const draftRef = useRef<RoundPlanDraft | null>(preservedInitial?.draft ?? null);
  const revisionRef = useRef(preservedInitial?.revision ?? 0);
  const savedFingerprintRef = useRef(preservedInitial?.savedFingerprint ?? "");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const queuedRef = useRef(false);
  const saveNowRef = useRef<(rebase?: boolean) => Promise<boolean>>(async () => false);

  const publishSaveState = useCallback((save: DraftSaveState) => {
    const draft = draftRef.current;
    if (draft) {
      draftCache.set(keyRef.current, {
        draft,
        revision: revisionRef.current,
        savedFingerprint: savedFingerprintRef.current,
        save,
      });
    }
    setState((current) =>
      current.kind === "ready" ? { ...current, save } : current,
    );
  }, []);

  const saveNow = useCallback(
    async (rebase = false): Promise<boolean> => {
      if (savePromiseRef.current) {
        queuedRef.current = true;
        return savePromiseRef.current;
      }

      const run = async (): Promise<boolean> => {
        let shouldRebase = rebase;

        do {
          queuedRef.current = false;
          const requestKey = keyRef.current;
          const currentDraft = draftRef.current;
          if (!currentDraft) return false;

          const requestFingerprint = fingerprint(currentDraft);
          if (!shouldRebase && requestFingerprint === savedFingerprintRef.current) {
            publishSaveState({ kind: "saved" });
            return true;
          }

          const controller = new AbortController();
          saveAbortRef.current = controller;
          publishSaveState({ kind: "saving" });

          try {
            if (shouldRebase) {
              const latestResponse = await fetch(
                `/api/rounds/${encodeURIComponent(selectedRound.roundId)}/rooms?parentUUID=${encodeURIComponent(parentUUID)}`,
                { cache: "no-store", signal: controller.signal },
              );
              if (await isConfirmedMissing(latestResponse)) {
                revisionRef.current = 0;
              } else if (!latestResponse.ok) {
                throw new Error(await readError(latestResponse));
              } else {
                const latest = (await latestResponse.json()) as ApiResponse<RoundPlan>;
                if (!latest.success) throw new Error(latest.error);
                revisionRef.current = latest.data.revision;
              }
            }

            const body: SaveRoundPlanRequest = {
              ...currentDraft,
              expectedRevision: revisionRef.current,
            };
            const response = await fetch(
              `/api/rounds/${encodeURIComponent(selectedRound.roundId)}/rooms`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
              },
            );
            const result = response.ok
              ? ((await response.json()) as ApiResponse<RoundPlan>)
              : null;

            if (!response.ok || !result?.success) {
              const message =
                result && !result.success ? result.error : await readError(response);
              if (keyRef.current === requestKey) {
                publishSaveState({
                  kind: "error",
                  message,
                  conflict: response.status === 409,
                });
              }
              return false;
            }

            if (keyRef.current !== requestKey) return false;
            revisionRef.current = result.data.revision;
            setSavedRevision(result.data.revision);
            savedFingerprintRef.current = requestFingerprint;

            if (draftRef.current && fingerprint(draftRef.current) === requestFingerprint) {
              publishSaveState({ kind: "saved" });
            } else {
              queuedRef.current = true;
              publishSaveState({ kind: "saving" });
            }
          } catch (error) {
            if (controller.signal.aborted || keyRef.current !== requestKey) return false;
            publishSaveState({
              kind: "error",
              message: error instanceof Error ? error.message : "Draft save failed.",
              conflict: false,
            });
            return false;
          } finally {
            if (saveAbortRef.current === controller) saveAbortRef.current = null;
          }

          shouldRebase = false;
        } while (
          queuedRef.current ||
          Boolean(draftRef.current && fingerprint(draftRef.current) !== savedFingerprintRef.current)
        );

        return true;
      };

      const promise = run();
      savePromiseRef.current = promise;
      try {
        return await promise;
      } finally {
        if (savePromiseRef.current === promise) savePromiseRef.current = null;
      }
    },
    [parentUUID, publishSaveState, selectedRound.roundId],
  );

  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  useEffect(() => {
    seedRef.current = seed;
  }, [seed]);

  useEffect(() => {
    const controller = new AbortController();
    keyRef.current = key;
    queuedRef.current = false;
    saveAbortRef.current?.abort();
    saveAbortRef.current = null;
    savePromiseRef.current = null;

    const cached = draftCache.get(key);
    if (cached && isDirty(cached)) {
      draftRef.current = cached.draft;
      revisionRef.current = cached.revision;
      savedFingerprintRef.current = cached.savedFingerprint;
      void Promise.resolve().then(() => {
        if (!controller.signal.aborted && keyRef.current === key) {
          setSavedRevision(cached.revision);
          setState({ kind: "ready", draft: cached.draft, save: cached.save });
        }
      });
      return () => controller.abort();
    }

    draftRef.current = null;
    revisionRef.current = 0;
    savedFingerprintRef.current = "";
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted && keyRef.current === key) {
        setSavedRevision(0);
        setState({ kind: "loading" });
      }
    });

    async function load() {
      try {
        const response = await fetch(
          `/api/rounds/${encodeURIComponent(selectedRound.roundId)}/rooms?parentUUID=${encodeURIComponent(parentUUID)}`,
          { cache: "no-store", signal: controller.signal },
        );

        let draft: RoundPlanDraft;
        let revision: number;
        if (await isConfirmedMissing(response)) {
          draft = (await seedRef.current?.()) ?? {
            parentUUID,
            roundId: selectedRound.roundId,
            title: selectedRound.title,
            rooms: [],
            stayInMainParticipantUUIDs: [],
          };
          if (draft.rooms.length === 0) draft.rooms = [newRoom(draft.rooms)];
          revision = 0;
        } else {
          if (!response.ok) throw new Error(await readError(response));
          const result = (await response.json()) as ApiResponse<RoundPlan>;
          if (!result.success) throw new Error(result.error);
          draft = draftFromPlan(result.data);
          revision = result.data.revision;
        }

        if (controller.signal.aborted || keyRef.current !== key) return;
        const savedFingerprint = revision === 0 ? "" : fingerprint(draft);
        const save: DraftSaveState = revision === 0 ? { kind: "saving" } : { kind: "saved" };
        draftRef.current = draft;
        revisionRef.current = revision;
        setSavedRevision(revision);
        savedFingerprintRef.current = savedFingerprint;
        draftCache.set(key, { draft, revision, savedFingerprint, save });
        setState({ kind: "ready", draft, save });
      } catch (error) {
        if (controller.signal.aborted || keyRef.current !== key) return;
        setState({
          kind: "load-error",
          message: error instanceof Error ? error.message : "Draft load failed.",
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [key, loadAttempt, parentUUID, selectedRound.roundId, selectedRound.title]);

  useEffect(() => () => saveAbortRef.current?.abort(), []);

  const draftForAutosave = state.kind === "ready" ? state.draft : null;
  const autosaveBlocked = state.kind === "ready" && state.save.kind === "error";

  useEffect(() => {
    if (!draftForAutosave || autosaveBlocked) return;
    draftRef.current = draftForAutosave;
    if (fingerprint(draftForAutosave) === savedFingerprintRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void saveNowRef.current(), SAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [autosaveBlocked, draftForAutosave]);

  const updateDraft = useCallback(
    (change: (draft: RoundPlanDraft) => RoundPlanDraft) => {
      setState((current) => {
        if (current.kind !== "ready") return current;
        const draft = change(current.draft);
        if (draft === current.draft) return current;

        const save: DraftSaveState = { kind: "saving" };
        draftRef.current = draft;
        draftCache.set(keyRef.current, {
          draft,
          revision: revisionRef.current,
          savedFingerprint: savedFingerprintRef.current,
          save,
        });
        return { kind: "ready", draft, save };
      });
    },
    [],
  );

  const updateRooms = useCallback(
    (change: (rooms: PlannedRoom[]) => PlannedRoom[]) => {
      updateDraft((draft) => {
        const rooms = change(draft.rooms);
        return rooms === draft.rooms ? draft : { ...draft, rooms };
      });
    },
    [updateDraft],
  );

  const addRoom = useCallback(() => {
    updateRooms((rooms) =>
      rooms.length >= MAX_ROOMS ? rooms : [...rooms, newRoom(rooms)],
    );
  }, [updateRooms]);

  const removeRoom = useCallback(
    (roomId: string) => {
      updateRooms((rooms) =>
        rooms.length <= 1 ? rooms : rooms.filter((room) => room.id !== roomId),
      );
    },
    [updateRooms],
  );

  const renameRoom = useCallback(
    (roomId: string, proposedName: string): string | null => {
      const name = proposedName.trim();
      const rooms = draftRef.current?.rooms ?? [];
      if (!name) return "Room name is required.";
      if (
        rooms.some(
          (room) => room.id !== roomId && room.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        return "Room names must be unique.";
      }
      updateRooms((current) =>
        current.map((room) => (room.id === roomId ? { ...room, name } : room)),
      );
      return null;
    },
    [updateRooms],
  );

  const assignParticipant = useCallback(
    ({ participantUUID, roomId }: { participantUUID: string; roomId: string }) => {
      updateDraft((draft) => assignParticipantToRoom(draft, { participantUUID, roomId }));
    },
    [updateDraft],
  );

  const unassignParticipant = useCallback(
    (participantUUID: string) => {
      updateDraft((draft) => clearParticipantPlacement(draft, participantUUID));
    },
    [updateDraft],
  );

  const keepParticipantInMain = useCallback(
    (participantUUID: string) => {
      updateDraft((draft) => keepInMain(draft, participantUUID));
    },
    [updateDraft],
  );

  const autoAssignParticipants = useCallback(
    (participantUUIDs: string[]) => {
      updateDraft((draft) => autoAssignParticipantsEvenly(draft, participantUUIDs));
    },
    [updateDraft],
  );

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    return saveNowRef.current();
  }, []);

  const reloadDraft = useCallback(() => {
    draftCache.delete(keyRef.current);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  return {
    state,
    addRoom,
    removeRoom,
    renameRoom,
    assignParticipant,
    unassignParticipant,
    keepParticipantInMain,
    autoAssignParticipants,
    savedRevision,
    flushSave,
    reloadDraft,
    canAdd: state.kind === "ready" && state.draft.rooms.length < MAX_ROOMS,
    retryLoad: () => setLoadAttempt((attempt) => attempt + 1),
    retrySave: () =>
      void saveNowRef.current(
        state.kind === "ready" && state.save.kind === "error" && state.save.conflict,
      ),
  };
}
