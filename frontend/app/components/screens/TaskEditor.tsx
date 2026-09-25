"use client";

import { toast } from "sonner";

import { useRoundTasks } from "@/lib/use-round-tasks";
import { roundLabel } from "@/lib/use-workspace";
import type { RoundMeta, Workspace } from "@/types/breakout";

import TaskFields from "../TaskFields";
import { Button, Card, SectionLabel } from "../ui";

/**
 * Step 2 of configuring one round: the task every room in it receives.
 *
 * One task per round. The store also holds per-room overrides, which no screen
 * writes yet; `use-round-tasks` carries them through a save untouched.
 *
 * Saving is explicit at the edges rather than on every keystroke: fields commit
 * on blur, and both navigation buttons flush first, so leaving the page cannot
 * lose an edit.
 */
export default function TaskEditor({
  workspace,
  round,
  onBack,
  onBackToRounds,
  onNext,
  nextLabel,
}: {
  workspace: Workspace;
  round: RoundMeta;
  /** Back to this round's rooms, which is step 1. */
  onBack: () => void;
  onBackToRounds: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const { task, setTask, state, save } = useRoundTasks(workspace.parentUUID, round.roundId);
  const label = roundLabel(workspace, round.roundId);
  const configured = workspace.rounds.length;

  /** Commit the current draft, then run a navigation that must not lose it. */
  async function leave(go: () => void) {
    if (state === "loading") return;
    if (!(await save(task))) {
      toast.error("Could not save the task. Try again before leaving this page.");
      return;
    }
    go();
  }

  return (
    <div className="bw-shell">
      <header className="bw-header">
        <button className="bw-back" onClick={() => void leave(onBack)} aria-label="Back to rooms">
          ←
        </button>
        <div className="bw-round-heading">
          <span style={{ fontSize: 15, fontWeight: 600 }}>Task &amp; activities - {label}</span>
          <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
            {round.title ?? label} · step 2 of 2 for this round
          </span>
        </div>

        <div className="bw-step-switch">
          <button className="bw-step-switch__step" onClick={() => void leave(onBack)}>
            Rooms
          </button>
          <span className="bw-setup-arrow">→</span>
          <span className="bw-step-switch__step bw-step-switch__step--current">
            Task &amp; activities
          </span>
        </div>

        <div className="bw-header-spacer" />
      </header>

      <div className="bw-body">
        <main className="bw-main">
          <TaskFields task={task} setTask={setTask} save={(next) => void save(next)} />
        </main>

        <aside className="bw-rail">
          <SectionLabel>Activities on this round</SectionLabel>
          <Card tone="dashed" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--bw-muted-2)" }}>
          </Card>

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
            <Button variant="outline" onClick={() => void leave(onBackToRounds)}>
              Back to rounds
            </Button>
            <Button onClick={() => void leave(onNext)}>{nextLabel}</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
