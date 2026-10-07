"use client";

import { useState } from "react";

import { ACTIVITY_KINDS } from "@/lib/activity-kinds";
import type { Activity } from "@/types/breakout";

import { Button, Modal, SectionLabel } from "./ui";

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

  async function done(close: () => void) {
    setSaving(true);
    const saved = await onSave({ ...activity, title: title.trim(), description: description.trim() });
    setSaving(false);
    if (saved) close();
  }

  return (
    <Modal label={kind.label} locked={saving} onClose={onClose}>
      {(close) => (
        <>
          <header className="bw-overlay__header">
            <span className="bw-activity-badge" style={{ background: kind.tint, color: kind.ink }}>
              {kind.label}
            </span>
            <div className="bw-header-spacer" />
            <Button size="sm" disabled={!title.trim()} busy={saving} onClick={() => void done(close)}>
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
              <SectionLabel>Additional Information</SectionLabel>
              <textarea
                className="bw-activity-description"
                rows={4}
                value={description}
                placeholder="Write any additional instructions here"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
