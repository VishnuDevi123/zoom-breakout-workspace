"use client";

import type { useRoundTasks } from "@/lib/use-round-tasks";

import TaskFields from "./TaskFields";
import { Button, Modal } from "./ui";

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

  /** The hook reports a failure; the panel then stays open so the edit is not lost. */
  async function saveBeforeClose() {
    if (state === "loading") return false;
    return save(task);
  }

  return (
    <Modal label={`Task for ${roundTitle}`} beforeClose={saveBeforeClose} onClose={onClose}>
      {(close) => (
        <>
          <header className="bw-overlay__header">
            <div className="bw-round-heading">
              <span className="bw-modal-title">Task - {roundTitle}</span>
            </div>
            <div className="bw-header-spacer" />
            <Button variant="secondary" size="sm" onClick={close}>
              Done
            </Button>
          </header>

          <div className="bw-overlay__body">
            {state === "loading" ? (
              <span style={{ fontSize: "var(--bw-fs-secondary)", color: "var(--bw-muted-2)" }}>Loading the task…</span>
            ) : (
              <TaskFields task={task} setTask={setTask} save={(next) => void save(next)} />
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
