"use client";

import { memberStatus } from "@/lib/activity-kinds";
import type { Activity, LiveState, PlannedRoom, RoomResponsesView } from "@/types/breakout";

import { Card, SectionLabel } from "./ui";

const AVATAR_TINTS = ["#eef1ff", "#c3faf5", "#fff4c4", "#fde0f0", "#e3f7d4"];

/**
 * Right column of the participant's room page: who is in the room and how far
 * each person is, then the host's message.
 *
 * People are the room's members from the host's draft. Once Zoom has told the
 * backend which breakout room this is, only members actually in it are listed.
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
  const roomUUID = live?.round?.roomUUIDs[room.id] ?? null;
  const names = new Map((live?.participants ?? []).map((p) => [p.participantUUID, p]));
  const members = room.participantUUIDs.filter(
    (uuid) => uuid === participantUUID || !roomUUID || names.get(uuid)?.location === roomUUID,
  );

  return (
    <aside className="bw-rail bw-room-sidebar">
      <SectionLabel>In this room</SectionLabel>
      {members.map((uuid, index) => {
        const name = uuid === participantUUID ? "You" : names.get(uuid)?.name || "Participant";
        const status = memberStatus(activities, view, uuid);
        return (
          <div className="bw-room-member" key={uuid}>
            <span className="bw-room-member__avatar" style={{ background: AVATAR_TINTS[index % AVATAR_TINTS.length] }}>
              {initials(name)}
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
