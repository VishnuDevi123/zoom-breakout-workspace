"use client";

import { toast } from "sonner";

import type { RoundMeta, RoundStatus, Workspace } from "@/types/breakout";

import { Button, Card, EditableName, Pill, SectionLabel } from "../ui";

const DURATION_STEP_SEC = 30;
const MIN_DURATION_SEC = 30;

const SETUP_STEPS = ["01 Build rounds", "02 Configure each round", "03 Review & launch"];

function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const STATUS_PILL: Record<RoundStatus, { label: string; tone: "neutral" | "teal" | "dark" }> = {
  planned: { label: "Planned", tone: "neutral" },
  launched: { label: "Live", tone: "teal" },
  closed: { label: "Done", tone: "dark" },
};

/** Rounds overview: order, titles and timing. Rooms are planned per round in the editor. */
export default function RoundsOverview({
  workspace,
  onHome,
  onAddRound,
  onDeleteRound,
  onUpdateRound,
  onUpdateWorkspace,
  onEditRound,
}: {
  workspace: Workspace;
  onHome: () => void;
  onAddRound: () => Promise<void>;
  onDeleteRound: (roundId: string) => Promise<void>;
  onUpdateRound: (roundId: string, patch: Partial<Pick<RoundMeta, "title" | "durationSec">>) => Promise<void>;
  onUpdateWorkspace: (patch: Partial<Pick<Workspace, "title" | "sameRoomsEveryRound">>) => Promise<void>;
  onEditRound: (roundId: string) => void;
}) {
  const totalSec = workspace.rounds.reduce((sum, round) => sum + round.durationSec, 0);
  const anyLaunched = workspace.rounds.some((round) => round.status === "launched");

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
        <button type="button" className="bw-back" aria-label="Back to start" onClick={onHome}>←</button>
        <div className="bw-round-heading">
          <EditableName
            value={workspace.title}
            placeholder="Sample Workflow"
            className="bw-workspace-title"
            onSave={(title) => void run(() => onUpdateWorkspace({ title: title ?? "Sample Workflow" }))}
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
              Click a round to plan its rooms. Come back any time to change one round.
            </span>
          </div>

          <div className="bw-round-list">
            {workspace.rounds.map((round, index) => (
              <RoundRow
                key={round.roundId}
                round={round}
                position={index + 1}
                onRename={(title) => run(() => onUpdateRound(round.roundId, { title }))}
                onDuration={(durationSec) => run(() => onUpdateRound(round.roundId, { durationSec }))}
                onDelete={() => run(() => onDeleteRound(round.roundId))}
                onEdit={() => onEditRound(round.roundId)}
              />
            ))}
            <button type="button" className="bw-add-round" onClick={() => void run(onAddRound)}>
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
          <Card tone="sunken">
            <label className="bw-switch-row">
              <input
                type="checkbox"
                checked={workspace.sameRoomsEveryRound}
                onChange={(event) => void run(() => onUpdateWorkspace({ sameRoomsEveryRound: event.target.checked }))}
              />
              <span>Same rooms every round</span>
            </label>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function RoundRow({
  round,
  position,
  onRename,
  onDuration,
  onDelete,
  onEdit,
}: {
  round: RoundMeta;
  position: number;
  onRename: (title: string | null) => void;
  onDuration: (durationSec: number) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const status = STATUS_PILL[round.status];

  return (
    <Card className="bw-round-row" style={{ borderLeftColor: round.dot }}>
      <div className="bw-round-row-title">
        <EditableName value={round.title} placeholder={`Round ${position}`} onSave={onRename} />
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>

      <div className="bw-round-row-side">
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
