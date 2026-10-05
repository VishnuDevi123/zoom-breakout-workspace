"use client";

import { ACTIVITY_KINDS } from "@/lib/activity-kinds";
import { initialsFrom } from "@/lib/participant-status";
import type { Activity, CheckListItem, PlannedRoom, RoomResponsesHostView } from "@/types/breakout";

import { Card, SectionLabel, StatusDot } from "./ui";

export interface RoomPerson {
  participantUUID: string;
  name: string;
}

/**
 * One room's work for the host: who is in it, the checklist, and one card per
 * activity with a count. Submissions themselves open from an activity card, so
 * this page stays readable however much a room has written.
 */
export default function RoomResultsPage({
  room,
  people,
  presentCount,
  checklist,
  activities,
  results,
  onBack,
  onOpenActivity,
}: {
  room: PlannedRoom;
  /** Everyone the plan puts in this room; names are for information only. */
  people: RoomPerson[];
  presentCount: number;
  checklist: CheckListItem[];
  activities: Activity[];
  results: RoomResponsesHostView | null;
  onBack: () => void;
  onOpenActivity: (activityId: string) => void;
}) {
  return (
    <div className="bw-results">
      <button type="button" className="bw-results__back" onClick={onBack}>
        ← All rooms
      </button>
      <div className="bw-results__bar">
        <StatusDot color={room.dot} />
        <span className="bw-results__title">{room.name}</span>
        <span className="bw-results__meta">
          {presentCount} of {people.length} here
        </span>
      </div>

      <div className="bw-results__split">
        <section className="bw-results__people" aria-label="People in this room">
          <SectionLabel>People</SectionLabel>
          {people.length === 0 ? <span className="bw-results__meta">Nobody planned here</span> : null}
          {people.map((person) => (
            <div className="bw-results__person" key={person.participantUUID}>
              <span className="bw-initials" aria-hidden>
                {initialsFrom(person.name)}
              </span>
              <span className="bw-results__person-name" title={person.name}>{person.name}</span>
            </div>
          ))}
        </section>

        <section className="bw-results__work">
          {checklist.length > 0 ? <ChecklistSummary items={checklist} results={results} /> : null}

          <SectionLabel>Activities</SectionLabel>
          {activities.length === 0 ? (
            <Card tone="dashed" className="bw-activity-empty">No activities in this round.</Card>
          ) : null}
          {activities.map((activity) => {
            const kind = ACTIVITY_KINDS[activity.kind];
            return (
              <button
                type="button"
                key={activity.id}
                className="bw-results__activity"
                onClick={() => onOpenActivity(activity.id)}
              >
                <span className="bw-activity-badge" style={{ background: kind.tint, color: kind.ink }}>
                  {kind.label}
                </span>
                <span className="bw-results__activity-title">{}</span>
                <span className="bw-results__meta">{progressText(activity, people.length, results)}</span>
                <span className="bw-results__chevron" aria-hidden>›</span>
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
}

/** The count on an activity card and atop its submissions page. */
export function progressText(activity: Activity, peopleCount: number, results: RoomResponsesHostView | null): string {
  if (activity.kind === "individual") {
    const answers = Object.values(results?.answers[activity.id] ?? {});
    const submitted = answers.filter((answer) => answer.status === "submitted").length;
    return `${submitted} of ${peopleCount} submitted`;
  }
  const notes = results?.ideas[activity.id] ?? [];
  const authors = new Set(notes.map((note) => note.participantUUID)).size;
  return `${notes.length} ${notes.length === 1 ? "idea" : "ideas"} from ${authors} ${authors === 1 ? "person" : "people"}`;
}

/** Read-only: which items are done and who ticked them. */
function ChecklistSummary({ items, results }: { items: CheckListItem[]; results: RoomResponsesHostView | null }) {
  const doneCount = items.filter((item) => results?.ticks[item.id]).length;

  return (
    <div className="bw-checklist">
      <div className="bw-checklist__header">
        <span className="bw-checklist__title">Checklist</span>
        <div style={{ flex: 1 }} />
        <span className="bw-results__meta">
          {doneCount} of {items.length} done
        </span>
      </div>
      {items.map((item) => {
        const tick = results?.ticks[item.id];
        return (
          <div className={`bw-checklist__row${tick ? " bw-checklist__row--done" : ""}`} key={item.id}>
            <span className="bw-checklist__box">{tick ? "✓" : ""}</span>
            <span className="bw-checklist__label">{item.label}</span>
            {tick ? <span className="bw-results__meta">{tick.authorName}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
