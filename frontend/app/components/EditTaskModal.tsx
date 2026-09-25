"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import type { useRoundTasks } from "@/lib/use-round-tasks";

import TaskFields from "./TaskFields";
import { Button, SectionLabel } from "./ui";

/**
 * Editing the running round's task without leaving the live screen.
 *
 * The full task page is deliberately not reused here: its back and next buttons
 * lead into other rounds' drafts, which a host must not edit while a round is
 * running. This panel has one way out, and it saves on the way.
 *
 * The task itself is owned by the live screen, so the rail's summary and this
 * panel always show the same thing.
 */
export default function EditTaskModal({
  roundTitle,
  tasks,
  onClose,
}: {
  roundTitle: string;
  tasks: ReturnType<typeof useRoundTasks>;
  onClose: () => void;
}) {
  const { task, setTask, state, save } = tasks;

  async function close() {
    if (state === "loading") return;
    if (!(await save(task))) {
      toast.error("Could not save the task. Try again before closing.");
      return;
    }
    onClose();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div
      className="bw-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Task for ${roundTitle}`}
      // Only a press that both starts and ends on the backdrop closes the panel,
      // so a text selection dragged out of a field does not dismiss it.
      onClick={(event) => {
        if (event.target === event.currentTarget) void close();
      }}
    >
      <div className="bw-overlay__panel">
        <header className="bw-overlay__header">
          <div className="bw-round-heading">
            <span style={{ fontSize: 15, fontWeight: 600 }}>Task - {roundTitle}</span>
          </div>
          <div className="bw-header-spacer" />
          <Button variant="outline" size="sm" onClick={() => void close()}>
            Done
          </Button>
        </header>

        <div className="bw-overlay__body">
          {state === "loading" ? (
            <span style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>Loading the task…</span>
          ) : (
            <TaskFields task={task} setTask={setTask} save={(next) => void save(next)} />
          )}
        </div>
      </div>
    </div>
  );
}
