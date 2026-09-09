import type { Room } from "@/types/breakout";

import { Card, StatusDot } from "./ui";

/** Room card from screen 03: colour dot, name, n/4 mono count, member rows. */
export default function RoomCard({
  room,
  capacity = 4,
}: {
  room: Room;
  capacity?: number;
}) {
  return (
    <Card className="bw-room-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot color={room.dot} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{room.name}</span>
        <div style={{ flex: 1 }} />
        <span
          className="bw-mono"
          style={{ fontSize: 10, color: "var(--bw-muted-3)" }}
        >
          {room.participants.length}/{capacity}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {room.participants.map((participant) => (
          <div className="bw-member-row" key={participant.participantUUID}>
            <span className="bw-avatar">{participant.initials}</span>
            <span style={{ flex: 1, fontSize: 11.5 }}>
              {participant.displayName}
              {participant.isHost ? " · host" : ""}
            </span>
          </div>
        ))}

        {room.participants.length === 0 && (
          <span style={{ fontSize: 11.5, color: "var(--bw-muted-3)" }}>
            Nobody placed here yet
          </span>
        )}
      </div>
    </Card>
  );
}
