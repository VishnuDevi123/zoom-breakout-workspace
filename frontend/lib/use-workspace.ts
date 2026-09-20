"use client";

import { useEffect, useState } from "react";

import type { RoundTemplate } from "@/lib/round-templates";
import type { ApiResponse, RoundMeta, SaveWorkspaceRequest, Workspace } from "@/types/breakout";

const JSON_HEADERS = { "Content-Type": "application/json" };

export type WorkspaceState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; workspace: Workspace };

async function apiResult<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !result.success) {
    throw new Error(result.success ? `Backend returned ${response.status}.` : result.error);
  }
  return result.data;
}

/** Display label by position; ids never encode position. */
export function roundLabel(workspace: Workspace, roundId: string): string {
  const index = workspace.rounds.findIndex((round) => round.roundId === roundId);
  return workspace.rounds[index]?.title ?? `Round ${index + 1}`;
}

/** Loads the meeting's round list and tracks which round the host is editing. */
export function useWorkspace(parentUUID: string) {
  const [state, setState] = useState<WorkspaceState>({ kind: "loading" });
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/workspace?parentUUID=${encodeURIComponent(parentUUID)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setState({ kind: "missing" });
          return;
        }
        const workspace = await apiResult<Workspace>(response);
        setState({ kind: "ready", workspace });
        setSelectedRoundId((current) =>
          workspace.rounds.some((round) => round.roundId === current)
            ? current
            : (workspace.rounds[0]?.roundId ?? null),
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Workspace load failed.",
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [parentUUID, loadAttempt]);

  function apply(workspace: Workspace, selectRoundId?: string | null): void {
    setState({ kind: "ready", workspace });
    if (selectRoundId !== undefined) setSelectedRoundId(selectRoundId);
  }

  /** PUT the whole editable record. Round ids must match the stored set. */
  async function saveWorkspace(request: Omit<SaveWorkspaceRequest, "parentUUID">): Promise<Workspace> {
    const workspace = await apiResult<Workspace>(
      await fetch("/api/workspace", {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ parentUUID, ...request }),
      }),
    );
    apply(workspace);
    return workspace;
  }

  /** Create with expectedRevision 0. Ids are assigned here because the server only assigns them on POST /rounds. */
  async function createWorkspace(title: string, rounds: RoundTemplate["rounds"]): Promise<Workspace> {
    return saveWorkspace({
      title,
      sameRoomsEveryRound: false,
      samePeopleEveryRound: false,
      rounds: rounds.map((round, index) => ({ roundId: `round-${index + 1}`, ...round })),
      expectedRevision: 0,
    });
  }

  /** Quick start: workspace with one untitled round, selected. */
  async function createWithFirstRound(title: string): Promise<void> {
    await createWorkspace(title, []);
    await addRound();
  }

  /** Landing "Build the rounds" with no template: empty workspace. */
  async function createEmpty(title: string): Promise<void> {
    await createWorkspace(title, []);
  }

  async function createFromTemplate(title: string, template: RoundTemplate): Promise<void> {
    const workspace = await createWorkspace(title, template.rounds);
    apply(workspace, workspace.rounds[0]?.roundId ?? null);
  }

  async function addRound(): Promise<void> {
    const workspace = await apiResult<Workspace>(
      await fetch("/api/workspace/rounds", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ parentUUID }),
      }),
    );
    apply(workspace, workspace.rounds.at(-1)?.roundId ?? null);
  }

  async function deleteRound(roundId: string): Promise<void> {
    const workspace = await apiResult<Workspace>(
      await fetch(
        `/api/workspace/rounds/${encodeURIComponent(roundId)}?parentUUID=${encodeURIComponent(parentUUID)}`,
        { method: "DELETE" },
      ),
    );
    apply(workspace, selectedRoundId === roundId ? (workspace.rounds[0]?.roundId ?? null) : undefined);
  }

  /** Edit one round's title or duration; other fields are resent unchanged. */
  async function updateRound(roundId: string, patch: Partial<Pick<RoundMeta, "title" | "durationSec">>): Promise<void> {
    if (state.kind !== "ready") return;
    const { workspace } = state;
    await saveWorkspace({
      title: workspace.title,
      sameRoomsEveryRound: workspace.sameRoomsEveryRound,
      samePeopleEveryRound: workspace.samePeopleEveryRound,
      rounds: workspace.rounds.map(({ roundId: id, title, durationSec }) =>
        id === roundId ? { roundId: id, title, durationSec, ...patch } : { roundId: id, title, durationSec },
      ),
      expectedRevision: workspace.revision,
    });
  }

  /** Edit workspace-level fields; rounds are resent unchanged. */
  async function updateWorkspace(
    patch: Partial<Pick<Workspace, "title" | "sameRoomsEveryRound" | "samePeopleEveryRound">>,
  ): Promise<void> {
    if (state.kind !== "ready") return;
    const { workspace } = state;
    await saveWorkspace({
      title: workspace.title,
      sameRoomsEveryRound: workspace.sameRoomsEveryRound,
      samePeopleEveryRound: workspace.samePeopleEveryRound,
      ...patch,
      rounds: workspace.rounds.map(({ roundId, title, durationSec }) => ({ roundId, title, durationSec })),
      expectedRevision: workspace.revision,
    });
  }

  const selectedRound: RoundMeta | null =
    state.kind === "ready"
      ? (state.workspace.rounds.find((round) => round.roundId === selectedRoundId) ?? null)
      : null;

  return {
    state,
    selectedRound,
    selectRound: setSelectedRoundId,
    createWithFirstRound,
    createEmpty,
    createFromTemplate,
    addRound,
    deleteRound,
    updateRound,
    updateWorkspace,
    reload: () => setLoadAttempt((n) => n + 1),
  };
}
