"use client";

import { ConfirmModal } from "./ui";

export function plural(count: number, word: string, words = `${word}s`): string {
  return `${count} ${count === 1 ? word : words}`;
}

/**
 * The one "save as template" confirmation, for a past workflow and for the
 * workflow being built: what is kept, and that nothing about people is.
 */
export default function SaveTemplateModal({
  title,
  rounds,
  rooms,
  activities,
  onConfirm,
  onClose,
}: {
  title: string;
  rounds: number;
  rooms: number;
  activities: number;
  /** Reports its own errors; the modal closes after it. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <ConfirmModal
      title={`Save ${title} as a template?`}
      message={`${plural(rounds, "round")}, ${plural(rooms, "room")} and ${plural(activities, "activity", "activities")} are saved with their tasks and times. Participant names, placements and answers are not saved.`}
      confirmLabel="Save template"
      confirmVariant="primary"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
