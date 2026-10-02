"use client";

import { useEffect, useState } from "react";

import { ACTIVITY_KINDS } from "@/lib/activity-kinds";
import type { Activity } from "@/types/breakout";

import { Button, SectionLabel } from "./ui";

/**
 * Add or edit one activity. Nothing is saved until Done, so cancelling a new
 * activity leaves nothing behind. Opened from the activity list only, never from
 * inside another panel, so two overlays never stack.
 */
export default function ActivityModal({
  activity,
  onSave,
  onClose,
}: {
  activity: Activity;
  /** Resolves false when the save failed; the modal then stays open. */
  onSave: (activity: Activity) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(activity.title);
  const [description, setDescription] = useState(activity.description);
  const [saving, setSaving] = useState(false);
  const kind = ACTIVITY_KINDS[activity.kind];

  async function done() {
    setSaving(true);
    const saved = await onSave({ ...activity, title: title.trim(), description: description.trim() });
    setSaving(false);
    if (saved) onClose();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="bw-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={kind.label}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bw-overlay__panel">
        <header className="bw-overlay__header">
          <span className="bw-activity-badge" style={{ background: kind.tint, color: kind.ink }}>
            {kind.label}
          </span>
          <div className="bw-header-spacer" />
          <Button size="sm" disabled={!title.trim() || saving} onClick={() => void done()}>
            Done
          </Button>
        </header>

        <div className="bw-overlay__body">
          <div className="bw-field">
            <SectionLabel>{kind.titleLabel}</SectionLabel>
            <input
              className="bw-goal-input"
              value={title}
              autoFocus
              placeholder={kind.titlePlaceholder}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="bw-field">
            <SectionLabel>Clue or extra info</SectionLabel>
            <textarea
              className="bw-activity-description"
              rows={4}
              value={description}
              placeholder="Optional - shown under the title"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
