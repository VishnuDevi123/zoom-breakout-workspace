"use client";

import { memberStatus } from "@/lib/activity-kinds";
import { AVATAR_TINTS, initialsFrom, roomMembers } from "@/lib/participant-status";
import type { Activity, LiveState, PlannedRoom, RoomResponsesView } from "@/types/breakout";

import { Card, SectionLabel } from "./ui";

/**
 * Right column of the participant's room page: who is in the room and how far
 * each person is, then the host's message.
 *
 * People come from `roomMembers`: the draft's members, narrowed to those in the
 * Zoom room once it is known.
 */
export default function RoomSidebar({
  room,
  live,
  activities,
  view,
  participantUUID,
}: {
  room: PlannedRoom;
  live: LiveState | null;
  activities: Activity[];
  view: RoomResponsesView | null;
  participantUUID: string;
}) {
  const members = roomMembers({ room, live, participantUUID });

  return (
    <aside className="bw-rail bw-room-sidebar">
      <SectionLabel>In this room</SectionLabel>
      {members.map(({ participantUUID: uuid, name }, index) => {
        const status = memberStatus(activities, view, uuid);
        return (
          <div className="bw-room-member" key={uuid}>
            <span className="bw-room-member__avatar" style={{ background: AVATAR_TINTS[index % AVATAR_TINTS.length] }}>
              {initialsFrom(name)}
            </span>
            <span className="bw-room-member__name">{name}</span>
            {activities.length > 0 ? (
              <span className={`bw-room-member__status bw-room-member__status--${status === "Submitted" ? "done" : "open"}`}>
                {status}
              </span>
            ) : null}
          </div>
        );
      })}

      <SectionLabel>Message from the host</SectionLabel>
      {/* Host messages are not wired yet; the panel holds their place. */}
      <Card className="bw-host-message">No message from the host yet.</Card>
    </aside>
  );
}

