"use client";

import { useEffect, useState } from "react";

import { roomMembers } from "@/lib/participant-status";
import type { useRoomResponses } from "@/lib/use-room-responses";
import type { CheckListItem, IdeaBoardActivity, LiveState, PlannedRoom } from "@/types/breakout";

import IdeaBoardPanel from "../IdeaBoardPanel";
import PageFrame from "../PageFrame";
import RoomBar from "../RoomBar";
import { Spinner } from "../ui";

/** Shortest time the opening spinner shows, as on round setup, so the switch reads as a page load. */
const OPEN_MIN_LOADING_MS = 500;

/**
 * The shared board, opened from the room page's cards, in the same frame and bar
 * as the room page: "← All activities" and the board on the left (70%), the
 * room's people and checklist on the right. An individual answer opens as a modal instead.
 */
export default function ActivityPage({
  activity,
  room,
  live,
  participantUUID,
  checklist,
  responses,
  onBack,
  onHome,
}: {
  activity: IdeaBoardActivity;
  room: PlannedRoom;
  live: LiveState | null;
  participantUUID: string;
  checklist: CheckListItem[];
  responses: ReturnType<typeof useRoomResponses>;
  onBack: () => void;
  onHome: () => void;
}) {
  const members = roomMembers({ room, live, participantUUID });
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), OPEN_MIN_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <PageFrame tone="participant" bar={<RoomBar room={room} live={live} onHome={onHome} />} contentKey={settled ? "open" : "loading"}>
      {settled ? (
        <div className="bw-room-layout">
          <IdeaBoardPanel
            activity={activity}
            members={members}
            participantUUID={participantUUID}
            checklist={checklist}
            responses={responses}
            onBack={onBack}
          />
        </div>
      ) : (
        <div className="bw-setup-pending" role="status">
          <Spinner large />
          <span>Opening the board…</span>
        </div>
      )}
    </PageFrame>
  );
}
