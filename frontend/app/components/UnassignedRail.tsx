import { STATUS_LABEL } from "@/lib/fixtures";
import type { Participant } from "@/types/breakout";

import { Pill, SectionLabel } from "./ui";

/** "Not yet placed" right rail from screen 03. */
export default function UnassignedRail({
  participants,
}: {
  participants: Participant[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <SectionLabel>Not yet placed</SectionLabel>
        <Pill tone="amber">{participants.length}</Pill>
      </div>

      {participants.map((participant) => (
        <div className="bw-rail-row" key={participant.participantUUID}>
          <span className="bw-avatar bw-avatar--rail">{participant.initials}</span>
          <span style={{ flex: 1, fontSize: 11.5 }}>{participant.displayName}</span>
          <span style={{ fontSize: 10.5, color: "var(--bw-muted-4)" }}>
            {STATUS_LABEL[participant.status]}
          </span>
        </div>
      ))}

      {participants.length === 0 && (
        <div
          className="bw-card bw-card--dashed"
          style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: "var(--bw-muted-2)",
            borderRadius: 9,
          }}
        >
          Everyone in the meeting has a room.
        </div>
      )}
    </div>
  );
}
