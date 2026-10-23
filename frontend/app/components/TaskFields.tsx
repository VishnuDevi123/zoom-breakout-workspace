"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { CheckListItem, RoomTask } from "@/types/breakout";

import { SectionLabel } from "./ui";

/**
 * The task fields, shared by the round's task page and the panel the host
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

  /** Items keep their ids across edits: ticks are stored per item id. */
  function editChecklist(labels: string[]) {
    const checklist = labels.map((label, at) => ({
      id: task.checklist[at]?.id ?? crypto.randomUUID(),
      label,
    }));
    setTask({ ...task, checklist });
  }

  function commitChecklist(checklist: CheckListItem[]) {
    const next = {
      ...task,
      checklist: checklist
        .map((item) => ({ ...item, label: item.label.trim() }))
        .filter((item) => item.label),
    };
    setTask(next);
    save(next);
  }

  return (
    <>
      <div className="bw-field">
        <SectionLabel>Goal shown to every room</SectionLabel>
        <ExpandingField
          className="bw-goal-input"
          value={task.goal}
          placeholder="What should this room achieve?"
          onChange={(goal) => setTask({ ...task, goal })}
          onCommit={() => save(task)}
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
          onRemove={(index) =>
            commitLines(
              "instructions",
              task.instructions.filter((_, at) => at !== index),
            )
          }
        />
      </div>

      <div className="bw-field">
        <SectionLabel>Checklist</SectionLabel>
        <SectionLabel className="bw-field__subheading">
          Anyone in the room can tick
        </SectionLabel>
        <LineList
          lines={task.checklist.map((item) => item.label)}
          numbered={false}
          addLabel="+ Add item"
          placeholder="Done when…"
          onChange={editChecklist}
          onCommit={() => commitChecklist(task.checklist)}
          onRemove={(index) =>
            commitChecklist(task.checklist.filter((_, at) => at !== index))
          }
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
          onRemove={(index) =>
            commitLines(
              "resources",
              task.resources.filter((_, at) => at !== index),
            )
          }
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
  onRemove,
}: {
  lines: string[];
  numbered: boolean;
  addLabel: string;
  placeholder: string;
  /** Every keystroke. */
  onChange: (lines: string[]) => void;
  /** Leaving a row. */
  onCommit: (lines: string[]) => void;
  /** By position, so a caller holding ids beside the lines removes the right one. */
  onRemove: (index: number) => void;
}) {
  return (
    <div className="bw-line-list">
      {lines.map((line, index) => (
        <div className="bw-line-row" key={index}>
          {numbered ? <span className="bw-mono bw-line-row__number">{index + 1}</span> : null}
          <ExpandingField
            className="bw-line-row__input"
            value={line}
            placeholder={placeholder}
            // A blank last row is one that was just added, so it takes the caret.
            autoFocus={line === "" && index === lines.length - 1}
            onChange={(text) => onChange(lines.map((current, at) => (at === index ? text : current)))}
            onCommit={() => onCommit(lines)}
          />
          <button
            className="bw-icon-button"
            aria-label="Remove line"
            onClick={() => onRemove(index)}
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

/**
 * A text field that shows one line (fading out at the edge when the text is
 * longer) and grows downwards to show all of it while it is being edited.
 * Both heights are explicit, so the change animates. Enter finishes editing.
 */
function ExpandingField({
  className,
  value,
  placeholder,
  autoFocus,
  onChange,
  onCommit,
}: {
  className: string;
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  /** Leaving the field: the point worth saving. */
  onCommit: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);

  // Open: the full text's height (it grows as you type). Closed: the one-line height from CSS.
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    if (!open) {
      element.style.height = "";
      element.scrollLeft = 0;
      return;
    }
    element.style.height = `${element.scrollHeight}px`;
  }, [open, value]);

  return (
    <textarea
      ref={field}
      className={`${className} bw-expanding`}
      data-open={open || undefined}
      rows={1}
      // Closed it stays on one line; open it wraps.
      wrap={open ? "soft" : "off"}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => setOpen(true)}
      onBlur={() => {
        setOpen(false);
        onCommit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
