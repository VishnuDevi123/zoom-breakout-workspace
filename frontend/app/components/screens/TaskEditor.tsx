"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useRoundTasks } from "@/lib/use-round-tasks";
import { roundLabel } from "@/lib/use-workspace";
import type { RoomTask, RoundMeta, Workspace } from "@/types/breakout";

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

  function commit(next: RoomTask) {
    setTask(next);
    void save(next);
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
          <div className="bw-field">
            <SectionLabel>Goal shown to every room</SectionLabel>
            <input
              className="bw-goal-input"
              value={task.goal}
              placeholder="What should this room achieve?"
              onChange={(event) => setTask({ ...task, goal: event.target.value })}
              onBlur={() => void save(task)}
            />
          </div>

          <div className="bw-field">
            <SectionLabel>Instructions</SectionLabel>
            <LineList
              lines={task.instructions}
              numbered
              addLabel="+ Add step"
              placeholder="One step per line"
              onChange={(instructions) => commit({ ...task, instructions })}
            />
          </div>

          <div className="bw-field" style={{ maxWidth: 420 }}>
            <SectionLabel>Resources</SectionLabel>
            <LineList
              lines={task.resources}
              numbered={false}
              addLabel="+ Attach link"
              placeholder="https://…"
              onChange={(resources) => commit({ ...task, resources })}
            />
          </div>
        </main>

        <aside className="bw-rail">
          <SectionLabel>Activities on this round</SectionLabel>
          <Card tone="dashed" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--bw-muted-2)" }}>
          </Card>

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 10.5, color: "var(--bw-muted-3)" }}>
              {configured} {configured === 1 ? "round" : "rounds"} in this workspace
            </span>
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

/**
 * An editable list of single-line strings. Blank lines are dropped by the
 * backend, so an empty new row costs nothing until it is typed into.
 */
function LineList({
  lines,
  numbered,
  addLabel,
  placeholder,
  onChange,
}: {
  lines: string[];
  numbered: boolean;
  addLabel: string;
  placeholder: string;
  onChange: (lines: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(lines);
  const [adding, setAdding] = useState(false);

  // The saved list is the source of truth; a fresh load replaces local edits.
  if (draft !== lines && !adding) {
    setDraft(lines);
  }

  function replace(index: number, value: string) {
    setDraft(draft.map((line, at) => (at === index ? value : line)));
  }

  function commit(next: string[]) {
    const kept = next.map((line) => line.trim()).filter(Boolean);
    setAdding(false);
    setDraft(kept);
    onChange(kept);
  }

  return (
    <div className="bw-line-list">
      {draft.map((line, index) => (
        <div className="bw-line-row" key={index}>
          {numbered ? <span className="bw-mono bw-line-row__number">{index + 1}</span> : null}
          <input
            className="bw-line-row__input"
            value={line}
            placeholder={placeholder}
            autoFocus={adding && index === draft.length - 1}
            onChange={(event) => replace(index, event.target.value)}
            onBlur={() => commit(draft)}
          />
          <button
            className="bw-icon-button"
            aria-label="Remove line"
            onClick={() => commit(draft.filter((_, at) => at !== index))}
          >
            ✕
          </button>
        </div>
      ))}

      <button
        className="bw-line-add"
        onClick={() => {
          setAdding(true);
          setDraft([...draft, ""]);
        }}
      >
        {addLabel}
      </button>
    </div>
  );
}
