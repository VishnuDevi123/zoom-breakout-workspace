"use client";

import { useState } from "react";
import { toast } from "sonner";

import { readSavedRoundPlan, saveRoundPlan } from "@/lib/execution-api";
import { autoAssignParticipantsEvenly } from "@/lib/room-plan-assignments";
import { copyRooms } from "@/lib/room-plan-copy";
import { useLiveRoomController } from "@/lib/use-live-room-controller";
import { MAX_ROOMS, newRoom } from "@/lib/use-room-plan";
import { roundLabel } from "@/lib/use-workspace";
import type {
  LiveState,
  RoundMeta,
  RoundPlan,
  RoundPlanDraft,
  Workspace,
  ZoomRole,
} from "@/types/breakout";

import { Button, Card, EditableName, Pill, SectionLabel } from "../ui";

const DURATION_STEP_SEC = 30;
const MIN_DURATION_SEC = 30;

const SETUP_STEPS = ["01 Build rounds", "02 Configure each round", "03 Review & launch"];

/** Grow or shrink a draft to exactly `count` rooms. Shrinking unassigns whoever was in the last rooms. */
function withRoomCount(draft: RoundPlanDraft, count: number): RoundPlanDraft {
  const rooms = [...draft.rooms];
  while (rooms.length < count) rooms.push(newRoom(rooms));
  return { ...draft, rooms: rooms.slice(0, count) };
}

function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Rounds overview: order, titles and timing. Rooms are planned per round in the editor. */
export default function RoundsOverview({
  workspace,
  parentUUID,
  plans,
  onPlansChanged,
  live,
  role,
  onLaunched,
  onHome,
  onAddRound,
  onDeleteRound,
  onUpdateRound,
  onUpdateWorkspace,
  onEditRound,
}: {
  workspace: Workspace;
  parentUUID: string;
  /** Saved draft per round, fetched by HostWorkspace. Null means never configured. */
  plans: Record<string, RoundPlan | null>;
  onPlansChanged: () => void;
  live: LiveState | null;
  role: ZoomRole | null;
  onLaunched: (roundId: string) => void;
  onHome: () => void;
  onAddRound: () => Promise<void>;
  onDeleteRound: (roundId: string) => Promise<void>;
  onUpdateRound: (roundId: string, patch: Partial<Pick<RoundMeta, "title" | "durationSec">>) => Promise<void>;
  onUpdateWorkspace: (
    patch: Partial<
      Pick<Workspace, "title" | "sameRoomsEveryRound" | "samePeopleEveryRound" | "autoStartNextRound">
    >,
  ) => Promise<void>;
  onEditRound: (roundId: string) => void;
}) {
  const totalSec = workspace.rounds.reduce((sum, round) => sum + round.durationSec, 0);
  const anyLaunched = workspace.rounds.some((round) => round.status === "launched");
  // The round the host would start now: the first one Zoom has not run yet.
  const target = workspace.rounds.find((round) => round.status !== "closed") ?? null;

  const [applying, setApplying] = useState(false);
  // Everyone Zoom still reports in the meeting. The host is never placed in a room.
  const eligibleUUIDs = (live?.participants ?? [])
    .filter((participant) => participant.location !== "left" && !participant.isHost)
    .map((participant) => participant.participantUUID);

  /** First draft for a round nobody has configured: seeded from round 1 when the host asked for that. */
  function startingDraft(round: RoundMeta): RoundPlanDraft {
    const empty: RoundPlanDraft = {
      parentUUID,
      roundId: round.roundId,
      title: roundLabel(workspace, round.roundId),
      rooms: [],
      stayInMainParticipantUUIDs: [],
    };
    const first = workspace.rounds[0];
    const source = first && first.roundId !== round.roundId ? plans[first.roundId] : null;
    if (!source || !workspace.sameRoomsEveryRound) return empty;
    return copyRooms(source, empty, { withPeople: workspace.samePeopleEveryRound });
  }

  /** Write one round's draft. The editor may have saved since this page loaded, so a stale revision retries once. */
  async function writePlan(round: RoundMeta, change: (draft: RoundPlanDraft) => RoundPlanDraft) {
    const known = plans[round.roundId] ?? null;
    try {
      await saveRoundPlan(parentUUID, change(known ?? startingDraft(round)), known?.revision ?? 0);
    } catch (error) {
      const fresh = await readSavedRoundPlan(parentUUID, round.roundId).catch(() => null);
      if (!fresh) throw error;
      await saveRoundPlan(parentUUID, change(fresh), fresh.revision);
    }
  }

  /**
   * Apply one change to every round. A launched round is skipped: its rooms are
   * already open in Zoom, so a draft edit would only desync the live view.
   */
  async function applyToAllRounds(change: (draft: RoundPlanDraft) => RoundPlanDraft, done: string) {
    setApplying(true);
    try {
      const editable = workspace.rounds.filter((round) => round.status !== "launched");
      for (const round of editable) await writePlan(round, change);
      onPlansChanged();
      toast.success(done);
    } catch (error) {
      onPlansChanged();
      toast.error(error instanceof Error ? error.message : "Could not save the rooms.");
    } finally {
      setApplying(false);
    }
  }

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workspace update failed.");
    }
  }

  return (
    <div className="bw-shell">
      <header className="bw-header">
        <button
          type="button"
          className="bw-back"
          aria-label="Back to start"
          onClick={onHome}
        >
          ←
        </button>
        <div className="bw-round-heading">
          <EditableName
            value={workspace.title}
            placeholder="Sample Workflow"
            className="bw-workspace-title"
            onSave={(title) =>
              void run(() =>
                onUpdateWorkspace({ title: title ?? "Sample Workflow" }),
              )
            }
          />
          <span style={{ fontSize: 11, color: "var(--bw-ink)" }}>
            {anyLaunched ? "A round is live" : "Draft workspace · not launched"}
          </span>
        </div>
        <div className="bw-header-spacer" />
        <div className="bw-setup-steps">
          {SETUP_STEPS.map((step, index) => (
            <span key={step} className="bw-setup-step-wrap">
              {index > 0 ? <span className="bw-setup-arrow">→</span> : null}
              <Pill tone={index === 0 ? "dark" : "outline"}>{step}</Pill>
            </span>
          ))}
        </div>
      </header>

      <div className="bw-body">
        <main className="bw-main">
          <div className="bw-section-heading">
            <span style={{ fontSize: 12, color: "var(--bw-ink)" }}>
              Add and Edit round configurations.

            </span>
          </div>

          <div className="bw-round-list">
            {workspace.rounds.map((round, index) => (
              <RoundRow
                key={round.roundId}
                round={round}
                position={index + 1}
                roomCount={plans[round.roundId]?.rooms.length ?? 0}
                placedCount={
                  plans[round.roundId]?.rooms.reduce((sum, room) => sum + room.participantUUIDs.length, 0) ?? 0
                }
                onRename={(title) =>
                  run(() => onUpdateRound(round.roundId, { title }))
                }
                onDuration={(durationSec) =>
                  run(() => onUpdateRound(round.roundId, { durationSec }))
                }
                onDelete={() => run(() => onDeleteRound(round.roundId))}
                onEdit={() => onEditRound(round.roundId)}
              />
            ))}
            <button
              type="button"
              className="bw-add-round"
              onClick={() => void run(onAddRound)}
            >
              + Add round
            </button>
          </div>
        </main>

        <aside className="bw-rail">
          <SectionLabel>Session shape</SectionLabel>
          <dl className="bw-shape">
            <dt>Rounds</dt>
            <dd>{workspace.rounds.length}</dd>
            <dt>Breakout time</dt>
            <dd className="bw-mono">{formatDuration(totalSec)}</dd>
          </dl>

          <SectionLabel>Applies to every round</SectionLabel>
          <Card tone="sunken" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <RoomsForEveryRound
              busy={applying}
              onApply={(count) =>
                void applyToAllRounds(
                  (draft) => withRoomCount(draft, count),
                  `Every round now has ${count} ${count === 1 ? "room" : "rooms"}.`,
                )
              }
            />
            <Button
              variant="outline"
              size="sm"
              disabled={applying || eligibleUUIDs.length === 0}
              title={eligibleUUIDs.length > 0 ? undefined : "Waiting for people to join."}
              onClick={() =>
                void applyToAllRounds(
                  (draft) =>
                    autoAssignParticipantsEvenly(
                      draft.rooms.length === 0 ? withRoomCount(draft, 1) : draft,
                      eligibleUUIDs,
                    ),
                  "People spread evenly across every round.",
                )
              }
            >
              Auto-assign evenly
            </Button>

            <label className="bw-switch-row">
              <input
                type="checkbox"
                style={{ accentColor: "#0d9488" }}
                checked={workspace.sameRoomsEveryRound}
                onChange={(event) =>
                  void run(() => onUpdateWorkspace({ sameRoomsEveryRound: event.target.checked }))
                }
              />
              <span>Same rooms every round</span>
            </label>
            <label className="bw-switch-row">
              <input
                type="checkbox"
                style={{ accentColor: "#0d9488" }}
                checked={workspace.samePeopleEveryRound}
                onChange={(event) =>
                  void run(() => onUpdateWorkspace({ samePeopleEveryRound: event.target.checked }))
                }
              />
              <span>Same people in rooms every round</span>
            </label>
          </Card>

          <SectionLabel>When a round ends</SectionLabel>
          <Card tone="sunken">
            <label className="bw-switch-row">
              <input
                type="checkbox"
                style={{ accentColor: "#0d9488" }}
                checked={workspace.autoStartNextRound}
                onChange={(event) =>
                  void run(() => onUpdateWorkspace({ autoStartNextRound: event.target.checked }))
                }
              />
              <span>Start the next round when the timer ends</span>
            </label>
          </Card>

          {target ? (
            <LaunchWorkflow
              workspace={workspace}
              parentUUID={parentUUID}
              role={role}
              target={target}
              plan={plans[target.roundId] ?? null}
              onLaunched={onLaunched}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** Starts the first round that has not run yet. Nothing reaches Zoom until this is pressed. */
function LaunchWorkflow({
  workspace,
  parentUUID,
  role,
  target,
  plan,
  onLaunched,
}: {
  workspace: Workspace;
  parentUUID: string;
  role: ZoomRole | null;
  target: RoundMeta;
  plan: RoundPlan | null;
  onLaunched: (roundId: string) => void;
}) {
  const label = roundLabel(workspace, target.roundId);
  const controller = useLiveRoomController({
    parentUUID,
    role,
    round: plan ?? { parentUUID, roundId: target.roundId, title: label, rooms: [], stayInMainParticipantUUIDs: [] },
    // Drafts are saved by the editor; the overview has no pending edits to flush.
    flushSave: () => Promise.resolve(true),
    onLaunched,
  });
  const ready = (plan?.rooms.length ?? 0) > 0;

  return (
    <Button
      variant="accent"
      disabled={!ready || controller.operation.kind === "running"}
      title={ready ? `Starts ${label}` : `${label} has no rooms yet.`}
      onClick={() => controller.launch()}
    >
      Launch Workflow
    </Button>
  );
}

/** Small box in the rail: one room count for every round at once. */
function RoomsForEveryRound({
  busy,
  onApply,
}: {
  busy: boolean;
  onApply: (count: number) => void;
}) {
  const [value, setValue] = useState("3");
  const count = Number(value);
  const valid = Number.isInteger(count) && count >= 1 && count <= MAX_ROOMS;

  return (
    <div className="bw-switch-row">
      <input
        type="number"
        min={1}
        max={MAX_ROOMS}
        value={value}
        aria-label="Rooms in every round"
        className="bw-rooms-input bw-mono"
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={busy || !valid}
        title={valid ? undefined : `Enter 1 to ${MAX_ROOMS}.`}
        onClick={() => onApply(count)}
      >
        Set rooms
      </Button>
    </div>
  );
}

function RoundRow({
  round,
  position,
  roomCount,
  placedCount,
  onRename,
  onDuration,
  onDelete,
  onEdit,
}: {
  round: RoundMeta;
  position: number;
  roomCount: number;
  placedCount: number;
  onRename: (title: string | null) => void;
  onDuration: (durationSec: number) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <Card className="bw-round-row" style={{ borderLeftColor: round.dot }}>
      <div className="bw-round-row-title">
        <EditableName value={round.title} placeholder={`Round ${position}`} onSave={onRename} />
      </div>

      <div className="bw-round-row-side">
        <span style={{ fontSize: 11.5, color: "var(--bw-ink)" }}>
          {roomCount === 0
            ? "No rooms yet"
            : `${roomCount} ${roomCount === 1 ? "room" : "rooms"} · ${placedCount} placed`}
        </span>
        <div className="bw-stepper">
          <button
            type="button"
            aria-label="Shorter"
            disabled={round.durationSec <= MIN_DURATION_SEC}
            onClick={() => onDuration(round.durationSec - DURATION_STEP_SEC)}
          >
            −
          </button>
          <span className="bw-room-count bw-mono">{formatDuration(round.durationSec)}</span>
          <button
            type="button"
            aria-label="Longer"
            onClick={() => onDuration(round.durationSec + DURATION_STEP_SEC)}
          >
            +
          </button>
        </div>
        <div className="bw-round-row-actions">
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit Round</Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={round.status === "launched"}
            title={round.status === "launched" ? "Close the round before removing it" : undefined}
            onClick={onDelete}
          >
            Remove
          </Button>
        </div>
      </div>
    </Card>
  );
}
