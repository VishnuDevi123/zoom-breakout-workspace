import { FIXTURE_SNAPSHOT } from "@/lib/fixtures";
import type { SessionState, ZoomRole } from "@/types/breakout";

import MeetingBadge from "../MeetingBadge";
import RoomCard from "../RoomCard";
import UnassignedRail from "../UnassignedRail";
import { Button } from "../ui";

/**
 * Host screen. This is the slice 0 shell, moved out of page.tsx so the gate can
 * choose it instead of the page rendering it unconditionally. A co-host reaches
 * this screen on exactly the same terms as the host.
 *
 * It still renders against fixtures. The controls stay inert until slices 3 to 6
 * wire them to the Zoom SDK.
 */
export default function HostWorkspace({
  meetingUUID,
  sessionState,
  role,
}: {
  meetingUUID: string;
  sessionState: SessionState | null;
  role: ZoomRole | null;
}) {
  const snapshot = FIXTURE_SNAPSHOT;

  return (
    <div className="bw-shell">
      <header className="bw-header">
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "var(--bw-amber)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          B
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Rooms &amp; people</span>
          <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
            Zoom will create these rooms when you launch
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <div className="bw-stepper">
          <button type="button" disabled aria-label="Fewer rooms">
            −
          </button>
          <span style={{ fontSize: 12, fontWeight: 600, padding: "0 4px" }}>
            {snapshot.rooms.length} rooms
          </span>
          <button type="button" disabled aria-label="More rooms">
            +
          </button>
        </div>

        <Button variant="outline" size="sm" disabled>
          Auto-assign evenly
        </Button>

        <Button variant="dark" size="sm" disabled>
          Open rooms
        </Button>
      </header>

      <div className="bw-body">
        <main className="bw-main">
          <div className="bw-room-grid">
            {snapshot.rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </main>

        <aside className="bw-rail">
          <UnassignedRail participants={snapshot.unassigned} />

          <div style={{ marginTop: "auto" }}>
            <MeetingBadge
              meetingUUID={meetingUUID}
              sessionState={sessionState}
              role={role ?? undefined}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
