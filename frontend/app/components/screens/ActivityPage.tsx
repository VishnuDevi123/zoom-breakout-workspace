"use client";

import { ACTIVITY_KINDS } from "@/lib/activity-kinds";
import { AVATAR_TINTS, initialsFrom, roomMembers } from "@/lib/participant-status";
import { formatClock, useRemainingSec } from "@/lib/round-clock";
import type { useRoomResponses } from "@/lib/use-room-responses";
import type { Activity, CheckListItem, LiveState, PlannedRoom } from "@/types/breakout";

import IdeaBoardPanel from "../IdeaBoardPanel";
import IndividualAnswerPanel from "../IndividualAnswerPanel";

/**
 * One activity, opened from the room page's cards. Replaces the room page's
 * header and body; the back arrow returns to the cards. The body is the
 * kind-specific panel, which lays out its own main area and right column.
 */
export default function ActivityPage({
  activity,
  position,
  room,
  live,
  participantUUID,
  checklist,
  responses,
  onBack,
}: {
  activity: Activity;
  /** 1-based place among the round's activities. */
  position: number;
  room: PlannedRoom;
  live: LiveState | null;
  participantUUID: string;
  checklist: CheckListItem[];
  responses: ReturnType<typeof useRoomResponses>;
  onBack: () => void;
}) {
  const kind = ACTIVITY_KINDS[activity.kind];
  const remainingSec = useRemainingSec(live?.round?.endsAt ?? 0);
  const members = roomMembers({ room, live, participantUUID });

  return (
    <div className="bw-shell bw-activity-page">
      <header className="bw-header">
        <button className="bw-back" onClick={onBack} aria-label="Back to activities">
          ←
        </button>
        <span className="bw-activity-page__badge" style={{ background: kind.tint, color: kind.ink }}>
          A{position}
        </span>
        <div className="bw-round-heading bw-activity-page__heading">
          {/* The question heads the page body ("To do"), so the header names the kind only. */}
          <span className="bw-activity-page__title">{kind.label}</span>
        </div>

        <div className="bw-header-spacer" />

        <div className="bw-avatar-stack" aria-label={members.map((member) => member.name).join(", ")}>
          {members.map((member, index) => (
            <span
              className="bw-avatar-stack__avatar"
              key={member.participantUUID}
              style={{ background: AVATAR_TINTS[index % AVATAR_TINTS.length] }}
            >
              {initialsFrom(member.name)}
            </span>
          ))}
        </div>

        {remainingSec !== null ? (
          <span className="bw-activity-page__clock bw-mono">{formatClock(remainingSec)}</span>
        ) : null}
      </header>

      <div className="bw-body">
        {activity.kind === "individual" ? (
          <IndividualAnswerPanel
            activity={activity}
            members={members}
            responses={responses}
            onBack={onBack}
          />
        ) : (
          <IdeaBoardPanel
            activity={activity}
            participantUUID={participantUUID}
            checklist={checklist}
            responses={responses}
            onBack={onBack}
          />
        )}
      </div>
    </div>
  );
}
