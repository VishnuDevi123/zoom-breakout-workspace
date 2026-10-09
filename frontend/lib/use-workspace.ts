"use client";

import { useEffect, useRef, useState } from "react";

import type {
  ApiResponse,
  PastWorkflow,
  RoundMeta,
  SaveWorkspaceRequest,
  WorkflowSnapshot,
  Workspace,
} from "@/types/breakout";

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
  // Latest revision the server returned. End Workflow runs right after a close
  // whose workspace has not rendered yet, so it cannot read `state`.
  const revision = useRef(0);

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
          revision.current = 0;
          setState({ kind: "missing" });
          return;
        }
        const workspace = await apiResult<Workspace>(response);
        revision.current = workspace.revision;
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
    revision.current = workspace.revision;
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

  /** Create an empty workspace (expectedRevision 0); rounds come from POST /rounds or a template. */
  async function createWorkspace(title: string): Promise<Workspace> {
    return saveWorkspace({
      title,
      sameRoomsEveryRound: false,
      samePeopleEveryRound: false,
      autoStartNextRound: true,
      rounds: [],
      expectedRevision: 0,
    });
  }

  /** Quick start: workspace with one untitled round, selected. */
  async function createWithFirstRound(title: string): Promise<void> {
    await createWorkspace(title);
    await addRound();
  }

  /** Landing "Build the rounds" with no template: empty workspace. */
  async function createEmpty(title: string): Promise<void> {
    await createWorkspace(title);
  }

  /** Swap a workflow that has not started (or none) for a template's rounds, rooms and tasks. */
  async function replaceWith(snapshot: WorkflowSnapshot): Promise<void> {
    const workspace = await apiResult<Workspace>(
      await fetch("/api/workspace/replace", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ parentUUID, expectedRevision: revision.current, snapshot }),
      }),
    );
    apply(workspace, workspace.rounds[0]?.roundId ?? null);
  }

  /** The backend keeps the workflow without people as a past workflow; the meeting then has none. */
  async function endWorkflow(): Promise<PastWorkflow[]> {
    const past = await apiResult<PastWorkflow[]>(
      await fetch("/api/workspace/end", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ parentUUID, expectedRevision: revision.current }),
      }),
    );
    revision.current = 0;
    setState({ kind: "missing" });
    setSelectedRoundId(null);
    return past;
  }

  /** Appends a round; the new one is last. Returns the workspace so a caller can find it. */
  async function addRound(options: { durationSec?: number } = {}): Promise<Workspace> {
    const workspace = await apiResult<Workspace>(
      await fetch("/api/workspace/rounds", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ parentUUID, ...options }),
      }),
    );
    apply(workspace, workspace.rounds.at(-1)?.roundId ?? null);
    return workspace;
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
      autoStartNextRound: workspace.autoStartNextRound,
      rounds: workspace.rounds.map(({ roundId: id, title, durationSec }) =>
        id === roundId ? { roundId: id, title, durationSec, ...patch } : { roundId: id, title, durationSec },
      ),
      expectedRevision: workspace.revision,
    });
  }

  /** Edit workspace-level fields; rounds are resent unchanged. */
  async function updateWorkspace(
    patch: Partial<
      Pick<Workspace, "title" | "sameRoomsEveryRound" | "samePeopleEveryRound" | "autoStartNextRound">
    >,
  ): Promise<void> {
    if (state.kind !== "ready") return;
    const { workspace } = state;
    // Show the new value at once; a checkbox that waits for the PUT flickers back first.
    apply({ ...workspace, ...patch });
    try {
      await saveWorkspace({
        title: workspace.title,
        sameRoomsEveryRound: workspace.sameRoomsEveryRound,
        samePeopleEveryRound: workspace.samePeopleEveryRound,
        autoStartNextRound: workspace.autoStartNextRound,
        ...patch,
        rounds: workspace.rounds.map(({ roundId, title, durationSec }) => ({ roundId, title, durationSec })),
        expectedRevision: workspace.revision,
      });
    } catch (error) {
      apply(workspace);
      throw error;
    }
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
    replaceWith,
    endWorkflow,
    addRound,
    deleteRound,
    updateRound,
    updateWorkspace,
    /** Adopt a workspace a non-workspace route handed back, such as launch or skip. */
    applyWorkspace: (workspace: Workspace) => apply(workspace),
    reload: () => setLoadAttempt((n) => n + 1),
  };
}
