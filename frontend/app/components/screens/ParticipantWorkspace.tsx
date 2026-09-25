"use client";

import { formatClock, useRemainingSec } from "@/lib/round-clock";
import type { ParticipantRound } from "@/lib/use-participant-round";
import type { LiveState, PlannedRoom } from "@/types/breakout";

import { Card, SectionLabel, StatusDot } from "../ui";

/**
 * The room a participant works in for one round: the task on the left, and the
 * activities they are asked to complete in the middle.
 *
 * Read-only for now. Activities land in a later week, so the middle column
 * carries the placeholder rather than the cards.
 */
export default function ParticipantWorkspace({
  round,
  room,
  live,
  participantUUID,
  onBack,
}: {
  round: ParticipantRound;
  room: PlannedRoom;
  live: LiveState | null;
  participantUUID: string;
  onBack: () => void;
}) {
  const { task, roundTitle, roundPosition, roundCount } = round;
  const remainingSec = useRemainingSec(live?.round?.endsAt ?? 0);
  const roomUUID = live?.round?.roomUUIDs[room.id] ?? null;
  const others = (live?.participants ?? [])
    .filter((p) => p.location === roomUUID && p.participantUUID !== participantUUID)
    .map((p) => p.name)
    .filter(Boolean);

  return (
    <div className="bw-shell">
      <header className="bw-header">
        <button className="bw-back" onClick={onBack} aria-label="Back to the round summary">
          ←
        </button>
        <StatusDot color={room.dot} />
        <div className="bw-round-heading">
          <span style={{ fontSize: 15, fontWeight: 600 }}>{room.name}</span>
          <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
            {others.length > 0 ? `You, ${others.join(", ")}` : "You are the only one here so far"}
          </span>
        </div>

        <span className="bw-header-divider" />

        <div className="bw-round-heading">
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>
            {roundPosition > 0 ? `Round ${roundPosition} of ${roundCount} · ` : ""}
            {roundTitle}
          </span>
          <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
            {task ? `${task.instructions.length} steps from your host` : "No task set yet"}
          </span>
        </div>

        <div className="bw-header-spacer" />

        {remainingSec !== null ? (
          <div className="bw-timer bw-timer--end">
            <span className="bw-timer__clock bw-mono">{formatClock(remainingSec)}</span>
            <span className="bw-timer__label">left in round</span>
          </div>
        ) : null}
      </header>

      <div className="bw-body">
        <aside className="bw-rail bw-rail--left bw-task-rail">
          <div className="bw-field">
            <SectionLabel>Your task this round</SectionLabel>
            {task ? (
              <h2 className="bw-task-goal">{task.goal}</h2>
            ) : (
              <p className="bw-task-empty">
                Your host has not written a task for this round. It appears here as soon as they do.
              </p>
            )}
          </div>

          {task && task.instructions.length > 0 ? (
            <div className="bw-field">
              <SectionLabel>Instructions</SectionLabel>
              <Card className="bw-instruction-list">
                {task.instructions.map((line, index) => (
                  <div className="bw-instruction-row" key={line}>
                    <span className="bw-mono bw-instruction-row__number">{index + 1}</span>
                    <span>{line}</span>
                  </div>
                ))}
              </Card>
            </div>
          ) : null}

          {task && task.resources.length > 0 ? (
            <div className="bw-field">
              <SectionLabel>Resources from the host</SectionLabel>
              {task.resources.map((resource) => (
                <ResourceRow key={resource} resource={resource} />
              ))}
            </div>
          ) : null}
        </aside>

        <main className="bw-main">
          <div className="bw-activities-heading">
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Activities</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: "var(--bw-muted-3)" }}>
              Work through them in any order
            </span>
          </div>

          <Card tone="dashed" className="bw-activities-empty">
            Nothing to submit this round. Follow the task on the left and talk it through with your
            room.
          </Card>
        </main>
      </div>
    </div>
  );
}

/**
 * One host-supplied link. A resource is stored as a plain string, so anything
 * that is not a URL is shown as text rather than as a dead link.
 */
function ResourceRow({ resource }: { resource: string }) {
  const isLink = /^https?:\/\//i.test(resource);

  if (!isLink) {
    return (
      <div className="bw-resource-row">
        <span className="bw-resource-row__mark" />
        <span className="bw-resource-row__label">{resource}</span>
      </div>
    );
  }

  return (
    <a className="bw-resource-row" href={resource} target="_blank" rel="noreferrer">
      <span className="bw-resource-row__mark" />
      <span className="bw-resource-row__label">{resource}</span>
      <span className="bw-resource-row__open">Open</span>
    </a>
  );
}
