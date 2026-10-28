import type { RoomStatus } from "@/types/breakout";

import RoomStatusOptions from "./RoomStatusOptions";

/**
 * A strip across the top of the room page where the room tells the host it
 * needs more time or is done. Anyone in the room sets it and the latest tap wins.
 */
export default function RoomStatusPicker({
  current,
  onChoose,
}: {
  current: RoomStatus;
  onChoose: (status: RoomStatus) => void;
}) {
  return (
    <section className="bw-room-status" aria-label="Tell your host">
      <div className="bw-room-status__text">
        <span className="bw-room-status__title">Tell your host</span>
        <span className="bw-room-status__hint">Let them know how your room is doing.</span>
      </div>
      <RoomStatusOptions current={current} onChoose={onChoose} />
    </section>
  );
}
