"use client";

import { useState } from "react";

import { formatClock } from "@/lib/round-clock";
import type { useRoundTasks } from "@/lib/use-round-tasks";
import { roundLabel } from "@/lib/use-workspace";
import type { RoundMeta, RoundPlan, Workspace } from "@/types/breakout";

import ActivityList from "./ActivityList";
import RoundSettingsModal from "./RoundSettingsModal";
import { Button, Card, ConfirmModal, Pill, SectionLabel } from "./ui";

type RoundPatch = Partial<Pick<RoundMeta, "title" | "durationSec">>;

/**
 * The live round's second page: what the running round asks of the rooms, and
 * the rounds still to come. Only rounds that have not run can be changed here.
 * Every handler reports its own errors.
 */
export default function SessionPage({
  workspace,
  plans,
  tasks,
  open,
  onEditTask,
  onAddRound,
  onUpdateRound,
  onDeleteRound,
  onSkipRound,
}: {
  workspace: Workspace;
  plans: Record<string, RoundPlan | null>;
  tasks: ReturnType<typeof useRoundTasks>;
  /** Whether the round is still running; activities can only change while it is. */
  open: boolean;
  onEditTask: () => void;
  onAddRound: () => Promise<void>;
  onUpdateRound: (roundId: string, patch: RoundPatch) => Promise<void>;
  onDeleteRound: (roundId: string) => Promise<void>;
  onSkipRound: (roundId: string, skipped: boolean) => Promise<void>;
}) {
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const positionOf = (roundId: string) => workspace.rounds.findIndex((round) => round.roundId === roundId) + 1;
  const settingsRound = workspace.rounds.find((round) => round.roundId === settingsFor) ?? null;

  async function addRound() {
    setAdding(true);
    await onAddRound();
    setAdding(false);
  }

  return (
    <div className="bw-session">
      <section className="bw-session__column">
        <SectionLabel>Current Workflow</SectionLabel>
        {workspace.rounds.map((round) => (
          <RoundCard
            key={round.roundId}
            round={round}
            label={roundLabel(workspace, round.roundId)}
            onSettings={() => setSettingsFor(round.roundId)}
            onDelete={() => setDeletingId(round.roundId)}
          />
        ))}
        <Button
          variant="secondary"
          busy={adding}
          onClick={() => void addRound()}
        >
          + Add round
        </Button>
      </section>

      <section className="bw-session__column">
        <SectionLabel>This round</SectionLabel>
        <button
          className="bw-task-summary"
          disabled={!open}
          onClick={onEditTask}
        >
          <span className="bw-task-summary__goal">
            {tasks.task.goal || "No task set for this round"}
          </span>
          <span className="bw-task-summary__action">
            {tasks.task.goal ? "Edit task" : "Add a task"}
          </span>
        </button>
        {open ? (
          <ActivityList
            activities={tasks.activities}
            live
            onSave={tasks.saveActivities}
          />
        ) : null}
      </section>

      {settingsRound ? (
        <RoundSettingsModal
          round={settingsRound}
          position={positionOf(settingsRound.roundId)}
          plan={plans[settingsRound.roundId] ?? null}
          onUpdateRound={onUpdateRound}
          onSkipRound={onSkipRound}
          onClose={() => setSettingsFor(null)}
        />
      ) : null}

      {deletingId ? (
        <ConfirmModal
          title={`Delete ${roundLabel(workspace, deletingId)}?`}
          message="Its rooms and placements are removed. This cannot be undone."
          confirmLabel="Delete round"
          onConfirm={() => onDeleteRound(deletingId)}
          onClose={() => setDeletingId(null)}
        />
      ) : null}
    </div>
  );
}

const STATUS_PILL: Record<RoundMeta["status"], { label: string; tone: "neutral" | "accent" | "amber" } | null> = {
  planned: null,
  launched: { label: "Live", tone: "accent" },
  closed: { label: "Done", tone: "neutral" },
  skipped: { label: "Skipped", tone: "amber" },
};

/** A round that already ran, or is running, has nothing left to change. */
function RoundCard({
  round,
  label,
  onSettings,
  onDelete,
}: {
  round: RoundMeta;
  label: string;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_PILL[round.status];
  const upcoming = round.status === "planned" || round.status === "skipped";

  return (
    <Card className="bw-round-card" tone={upcoming ? "default" : "sunken"}>
      <div className="bw-round-card__top">
        <span className="bw-round-card__title" title={label}>{label}</span>
        {status ? <Pill tone={status.tone}>{status.label}</Pill> : null}
        <span className="bw-mono bw-round-card__time">{formatClock(round.durationSec)}</span>
      </div>
      {upcoming ? (
        <div className="bw-round-card__actions">
          <Button variant="secondary" size="sm" onClick={onSettings}>
            Settings
          </Button>
          <Button variant="secondary" size="sm" className="bw-button--danger-text" onClick={onDelete}>
            Delete round
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
