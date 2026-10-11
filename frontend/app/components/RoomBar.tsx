"use client";

import { formatClock, useRemainingSec } from "@/lib/round-clock";
import type { LiveState, PlannedRoom } from "@/types/breakout";

import { BrandMark } from "./ui";

/** Top bar of every participant room screen: logo (home), room name, time left. */
export default function RoomBar({
  room,
  live,
  onHome,
}: {
  room: PlannedRoom;
  live: LiveState | null;
  onHome: () => void;
}) {
  const remainingSec = useRemainingSec(live?.round?.endsAt ?? 0);

  return (
    <>
      <BrandMark onHome={onHome} />
      <span className="bw-header-title">{room.name}</span>
      {remainingSec !== null ? (
        <span className="bw-live-clock bw-mono bw-room-bar__clock" title="Time left in this round">
          {formatClock(remainingSec)}
        </span>
      ) : null}
    </>
  );
}
