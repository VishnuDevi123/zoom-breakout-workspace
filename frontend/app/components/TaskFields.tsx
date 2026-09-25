"use client";

import type { RoomTask } from "@/types/breakout";

import { SectionLabel } from "./ui";

/**
 * The three task fields, shared by the round's task page and the panel the host
 * opens mid-round. Nothing here knows where it is rendered.
 *
 * Saving happens at the edges rather than on every keystroke: `setTask` reports
 * each edit, and `save` is called when a field is done with.
 */
export default function TaskFields({
  task,
  setTask,
  save,
}: {
  task: RoomTask;
  setTask: (task: RoomTask) => void;
  save: (task: RoomTask) => void;
}) {
  /** Blank rows are working space while typing; they are dropped on save. */
  function commitLines(field: "instructions" | "resources", lines: string[]) {
    const next = { ...task, [field]: lines.map((line) => line.trim()).filter(Boolean) };
    setTask(next);
    save(next);
  }

  return (
    <>
      <div className="bw-field">
        <SectionLabel>Goal shown to every room</SectionLabel>
        <input
          className="bw-goal-input"
          value={task.goal}
          placeholder="What should this room achieve?"
          onChange={(event) => setTask({ ...task, goal: event.target.value })}
          onBlur={() => save(task)}
        />
      </div>

      <div className="bw-field">
        <SectionLabel>Instructions</SectionLabel>
        <LineList
          lines={task.instructions}
          numbered
          addLabel="+ Add step"
          placeholder="One step per line"
          onChange={(instructions) => setTask({ ...task, instructions })}
          onCommit={(instructions) => commitLines("instructions", instructions)}
        />
      </div>

      <div className="bw-field" style={{ maxWidth: 420 }}>
        <SectionLabel>Resources</SectionLabel>
        <LineList
          lines={task.resources}
          numbered={false}
          addLabel="+ Attach link"
          placeholder="https://…"
          onChange={(resources) => setTask({ ...task, resources })}
          onCommit={(resources) => commitLines("resources", resources)}
        />
      </div>
    </>
  );
}

/**
 * An editable list of single-line strings, fully controlled by the caller.
 * Keeping a local copy here would fight the saved list on every keystroke, so
 * `onChange` reports each edit and `onCommit` marks the points worth saving.
 */
function LineList({
  lines,
  numbered,
  addLabel,
  placeholder,
  onChange,
  onCommit,
}: {
  lines: string[];
  numbered: boolean;
  addLabel: string;
  placeholder: string;
  /** Every keystroke. */
  onChange: (lines: string[]) => void;
  /** Leaving a row, or removing one. */
  onCommit: (lines: string[]) => void;
}) {
  return (
    <div className="bw-line-list">
      {lines.map((line, index) => (
        <div className="bw-line-row" key={index}>
          {numbered ? <span className="bw-mono bw-line-row__number">{index + 1}</span> : null}
          <input
            className="bw-line-row__input"
            value={line}
            placeholder={placeholder}
            // A blank last row is one that was just added, so it takes the caret.
            autoFocus={line === "" && index === lines.length - 1}
            onChange={(event) =>
              onChange(lines.map((current, at) => (at === index ? event.target.value : current)))
            }
            onBlur={() => onCommit(lines)}
          />
          <button
            className="bw-icon-button"
            aria-label="Remove line"
            onClick={() => onCommit(lines.filter((_, at) => at !== index))}
          >
            ✕
          </button>
        </div>
      ))}

      <button className="bw-line-add" onClick={() => onChange([...lines, ""])}>
        {addLabel}
      </button>
    </div>
  );
}
