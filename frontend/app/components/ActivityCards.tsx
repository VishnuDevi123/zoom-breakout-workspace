"use client";

import { ACTIVITY_KINDS, activityProgress, PROGRESS_LABELS } from "@/lib/activity-kinds";
import type { Activity, RoomResponsesView } from "@/types/breakout";

import { Button, Card } from "./ui";

/**
 * The participant's activities for this round, in the host's order. Each card
 * shows the host's question only - the extra description belongs on the
 * activity's own page - with the caller's progress and an Open button.
 */
export default function ActivityCards({
  activities,
  view,
  participantUUID,
  onOpen,
}: {
  activities: Activity[];
  view: RoomResponsesView | null;
  participantUUID: string;
  onOpen: (activity: Activity) => void;
}) {
  const completed = activities.filter(
    (activity) => activityProgress(activity, view, participantUUID) === "completed",
  ).length;

  return (
    <>
      <div className="bw-activities-heading">
        <h2 className="bw-room-title">Activities</h2>
        {activities.length > 0 ? (
          <span className="bw-activity-count">
            {completed} of {activities.length} done
          </span>
        ) : null}
      </div>

      {activities.length === 0 ? (
        <Card tone="dashed" className="bw-activities-empty">
          Nothing to submit this round.
        </Card>
      ) : null}

      {activities.map((activity, index) => {
        const kind = ACTIVITY_KINDS[activity.kind];
        const progress = activityProgress(activity, view, participantUUID);

        return (
          <Card className="bw-room-activity" key={activity.id}>
            <div className="bw-room-activity__header">
              <span className="bw-activity-badge" style={{ background: kind.tint, color: kind.ink }}>
                A{index + 1}
              </span>
              <span className="bw-room-activity__kind" style={{ color: kind.ink }}>
                {kind.label}
              </span>
              {/* Zero-width when wide; a forced line break when the card is narrow. */}
              <span className="bw-room-activity__break" aria-hidden />
              <span className="bw-room-activity__scope">
                {activity.kind === "individual" ? "Private" : "Shared"}
              </span>
              <span className="bw-room-activity__spacer" aria-hidden />
              <span className={`bw-progress-pill bw-progress-pill--${progress}`}>
                {PROGRESS_LABELS[progress]}
              </span>
            </div>

            <p className="bw-room-activity__question">{activity.title}</p>

            <div className="bw-room-activity__footer">
              <Button size="sm" onClick={() => onOpen(activity)}>
                Open
              </Button>
            </div>
          </Card>
        );
      })}
    </>
  );
}
