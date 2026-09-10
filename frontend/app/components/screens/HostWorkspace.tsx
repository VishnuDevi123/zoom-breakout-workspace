"use client";

import { useRoomSnapshot, type RoomSnapshotState } from "@/lib/use-room-snapshot";
import type { SessionState, ZoomRole } from "@/types/breakout";

import RawSdkPanel from "../debug/RawSdkPanel";
import MeetingBadge from "../MeetingBadge";
import RoomCard from "../RoomCard";
import UnassignedRail from "../UnassignedRail";
import { Button, Card, Pill, SectionLabel } from "../ui";

/**
 * Host screen. A co-host reaches it on exactly the same terms as the host.
 *
 * From slice 2 the cards render the live Zoom room state rather than fixtures.
 * The read is manual: the Refresh button re-reads the client. Slice 7 adds the
 * live subscription that removes the button's reason to exist.
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
  const { state, refresh, isRefreshing } = useRoomSnapshot();

  const snapshot = state.kind === "ready" ? state.snapshot : null;

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
            Live from the Zoom client
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <div className="bw-stepper">
          <button type="button" disabled aria-label="Fewer rooms">
            −
          </button>
          <span style={{ fontSize: 12, fontWeight: 600, padding: "0 4px" }}>
            {snapshot ? snapshot.rooms.length : "—"} rooms
          </span>
          <button type="button" disabled aria-label="More rooms">
            +
          </button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </Button>

        <Button variant="outline" size="sm" disabled>
          Auto-assign evenly
        </Button>

        <Button variant="dark" size="sm" disabled>
          Open rooms
        </Button>
      </header>

      <div className="bw-body">
        <main className="bw-main">
          <RoomGrid state={state} />
        </main>

        <aside className="bw-rail">
          <UnassignedRail participants={snapshot ? snapshot.unassigned : []} />

          {state.kind === "ready" && state.rosterError ? (
            <Card tone="dashed" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--bw-muted-2)", lineHeight: 1.45 }}>
                The meeting roster could not be read, so this list may be
                incomplete. Room membership above is still accurate.
              </span>
              <span className="bw-mono" style={{ fontSize: 10, color: "var(--bw-muted-4)" }}>
                {state.rosterError.code}
              </span>
            </Card>
          ) : null}

          <RawSdkPanel />

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

/**
 * The main pane in each of its four conditions. Kept beside HostWorkspace
 * rather than in its own file, because it is meaningless anywhere else.
 */
function RoomGrid({ state }: { state: RoomSnapshotState }) {
  if (state.kind === "loading") {
    return (
      <Card tone="sunken" style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>
        Reading the breakout rooms from Zoom…
      </Card>
    );
  }

  if (state.kind === "error") {
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: 7, maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <SectionLabel>Read failed</SectionLabel>
          <Pill tone="red">SDK error</Pill>
        </div>

        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--bw-muted-2)" }}>
          Zoom refused the room list. Try Refresh once the meeting is fully
          joined.
        </span>

        <div
          className="bw-card bw-card--sunken"
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <span className="bw-mono" style={{ fontSize: 11, color: "var(--bw-red-deep)" }}>
            {state.error.code}
          </span>

          <span
            style={{
              fontSize: 11,
              lineHeight: 1.45,
              color: "var(--bw-muted-2)",
              overflowWrap: "anywhere",
            }}
          >
            {state.error.message}
          </span>
        </div>
      </Card>
    );
  }

  if (state.snapshot.rooms.length === 0) {
    return <EmptyRooms unassignedCount={state.snapshot.unassigned.length} />;
  }

  return (
    <div className="bw-room-grid">
      {state.snapshot.rooms.map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}
    </div>
  );
}

/** Shown when the meeting has no breakout rooms at all, which is the normal start. */
function EmptyRooms({ unassignedCount }: { unassignedCount: number }) {
  return (
    <Card tone="dashed" style={{ display: "flex", flexDirection: "column", gap: 7, maxWidth: 420 }}>
      <SectionLabel>No rooms yet</SectionLabel>

      <span style={{ fontSize: 13, fontWeight: 600 }}>
        This meeting has no breakout rooms
      </span>

      <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--bw-muted-2)" }}>
        {unassignedCount > 0
          ? `${unassignedCount} people are waiting to be placed. Create rooms in the Zoom client and press Refresh.`
          : "Create rooms in the Zoom client and press Refresh."}
      </span>
    </Card>
  );
}
