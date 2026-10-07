"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ACTIVITY_KINDS } from "@/lib/activity-kinds";
import type { Activity } from "@/types/breakout";

import ActivityModal from "./ActivityModal";
import { Button, Card, Pill, SectionLabel } from "./ui";

/**
 * The round's activities as rail cards: open one to edit it, drag to reorder,
 * remove with a confirming second click, add another from the rows below.
 * Used on the task page before launch and on the live rail during the round.
 */
export default function ActivityList({
  activities,
  live,
  onSave,
}: {
  activities: Activity[];
  /** A removal mid-round also deletes what rooms wrote, so the warning says so. */
  live: boolean;
  onSave: (activities: Activity[]) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<Activity | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function saveActivity(activity: Activity) {
    const exists = activities.some((current) => current.id === activity.id);
    return onSave(
      exists
        ? activities.map((current) => (current.id === activity.id ? activity : current))
        : [...activities, activity],
    );
  }

  async function remove(id: string) {
    setConfirmingId(null);
    if (await onSave(activities.filter((activity) => activity.id !== id))) {
      toast.success("Activity removed.");
    }
  }

  function moveTo(target: number) {
    if (dragIndex === null || dragIndex === target) return;
    const next = [...activities];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    void onSave(next);
  }

  return (
    <>
      <div className="bw-activity-heading">
        <SectionLabel>{live ? "Activities this round" : "Activities on this round"}</SectionLabel>
      </div>

      {activities.map((activity, index) => {
        const kind = ACTIVITY_KINDS[activity.kind];
        const label = `A${index + 1}`;

        if (confirmingId === activity.id) {
          return (
            <Card className="bw-activity-card bw-activity-card--confirm" key={activity.id}>
              <span>
                Remove {label} &ldquo;{activity.title}&rdquo;?{" "}
                {live
                  ? "This deletes every answer and note rooms added to it. It cannot be undone."
                  : "Rooms will not see it."}
              </span>
              <div className="bw-activity-card__actions">
                <Button variant="secondary" size="sm" onClick={() => setConfirmingId(null)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={() => void remove(activity.id)}>
                  Remove
                </Button>
              </div>
            </Card>
          );
        }

        return (
          <Card
            className="bw-activity-card"
            key={activity.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => moveTo(index)}
            onClick={() => setEditing(activity)}
          >
            <div className="bw-activity-card__header">
              <span className="bw-activity-card__grip" aria-hidden>⠿</span>
              <span className="bw-activity-badge" style={{ background: kind.tint, color: kind.ink }}>
                {label}
              </span>
              <span className="bw-activity-card__kind">{kind.label}</span>
              <button
                className="bw-icon-button"
                aria-label={`Remove ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmingId(activity.id);
                }}
              >
                ✕
              </button>
            </div>
            <span className="bw-activity-card__title">{activity.title}</span>
            {activity.description ? (
              <span className="bw-activity-card__description">{activity.description}</span>
            ) : null}
          </Card>
        );
      })}

      {activities.length === 0 ? (
        <Card tone="dashed" className="bw-activity-empty">
          No activity added yet.... 
        </Card>
      ) : null}

      <SectionLabel>Add another</SectionLabel>
      {(Object.keys(ACTIVITY_KINDS) as Activity["kind"][]).map((kind) => (
        <button
          className="bw-activity-add"
          key={kind}
          onClick={() => setEditing({ kind, id: crypto.randomUUID(), title: "", description: "" })}
        >
          <span className="bw-activity-add__swatch" style={{ background: ACTIVITY_KINDS[kind].tint }} />
          <span className="bw-activity-add__label">{ACTIVITY_KINDS[kind].label}</span>
          {ACTIVITY_KINDS[kind].hint ? (
            <span className="bw-activity-add__hint">{ACTIVITY_KINDS[kind].hint}</span>
          ) : null}
        </button>
      ))}

      {editing ? (
        <ActivityModal activity={editing} onSave={saveActivity} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
