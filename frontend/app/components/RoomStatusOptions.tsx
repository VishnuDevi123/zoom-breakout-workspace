import type { RoomStatus } from "@/types/breakout";

const OPTIONS: { status: Exclude<RoomStatus, "onTrack">; label: string }[] = [
  { status: "moreTime", label: "Need more time" },
  { status: "done", label: "We're done" },
];

/**
 * Two toggles for the room's status. Nothing pressed means on track; tapping
 * the pressed one again clears it. Used in the room page strip and the one-minute reminder.
 */
export default function RoomStatusOptions({
  current,
  onChoose,
}: {
  current: RoomStatus;
  onChoose: (status: RoomStatus) => void;
}) {
  return (
    <div className="bw-room-status__options" role="group" aria-label="Room status">
      {OPTIONS.map((option) => {
        const pressed = option.status === current;
        return (
          <button
            key={option.status}
            className={`bw-room-status__option bw-room-status__option--${option.status}`}
            aria-pressed={pressed}
            onClick={() => onChoose(pressed ? "onTrack" : option.status)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
