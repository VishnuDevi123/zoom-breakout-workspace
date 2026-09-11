"use client";

import { useRoomPlan, type SelectedRound } from "@/lib/use-room-plan";
import { useRoomSnapshot } from "@/lib/use-room-snapshot";
import type { Participant, RoomSnapshot, SessionState, ZoomRole } from "@/types/breakout";

import MeetingBadge from "../MeetingBadge";
import Rooms from "../Rooms";
import RawSdkPanel from "../debug/RawSdkPanel";
import { Button, Card, SectionLabel } from "../ui";

// Temporary selection until round navigation supplies this data.
const ROUND_ONE: SelectedRound = { roundId: "round-1", title: "Round 1" };

function rosterFrom(snapshot: RoomSnapshot | null): Participant[] {
  if (!snapshot) return [];
  const participants = [...snapshot.unassigned, ...snapshot.rooms.flatMap((room) => room.participants)];
  return [...new Map(participants.map((participant) => [participant.participantUUID, participant])).values()];
}

/** Week 3 wrapper: one draft round plus independent live Zoom roster reads. */
export default function HostWorkspace({
  meetingUUID,
  sessionState,
  role,
}: {
  meetingUUID: string;
  sessionState: SessionState | null;
  role: ZoomRole | null;
}) {
  const { state: snapshotState, refresh, isRefreshing } = useRoomSnapshot();
  const plan = useRoomPlan(meetingUUID, ROUND_ONE);
  const snapshot = snapshotState.kind === "ready" ? snapshotState.snapshot : null;
  const rosterError =
    snapshotState.kind === "error"
      ? snapshotState.error.code
      : snapshotState.kind === "ready"
        ? snapshotState.rosterError?.code
        : undefined;

  if (plan.state.kind !== "ready") {
    return (
      <div className="bw-shell">
        <header className="bw-header">
          <span className="bw-brand-mark">B</span>
          <div className="bw-round-heading">
            <span style={{ fontSize: 15, fontWeight: 600 }}>Rooms &amp; people — Round 1</span>
            <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>Draft room plan</span>
          </div>
          <div className="bw-header-spacer" />
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing…" : "Refresh live roster"}
          </Button>
        </header>
        <div className="bw-body">
          <main className="bw-main">
            {plan.state.kind === "loading" ? (
              <Card tone="sunken" style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>
                Loading Round 1 draft…
              </Card>
            ) : (
              <Card style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
                <SectionLabel>Draft load failed</SectionLabel>
                <span style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>
                  {plan.state.message}
                </span>
                <Button variant="outline" size="sm" onClick={plan.retryLoad}>Retry load</Button>
              </Card>
            )}
          </main>
          <aside className="bw-rail">
            <div style={{ marginTop: "auto" }}>
              <MeetingBadge meetingUUID={meetingUUID} sessionState={sessionState} role={role ?? undefined} />
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <Rooms
      round={plan.state.draft}
      roster={rosterFrom(snapshot)}
      liveRooms={snapshot?.rooms}
      save={plan.state.save}
      canAdd={plan.canAdd}
      isRefreshing={isRefreshing}
      rosterError={rosterError}
      onAddRoom={plan.addRoom}
      onRemoveRoom={plan.removeRoom}
      onRenameRoom={plan.renameRoom}
      onRefresh={() => void refresh()}
      onRetrySave={plan.retrySave}
      onReloadDraft={plan.reloadDraft}
      onImportLiveRooms={plan.importLiveRooms}
      onBeforeNavigate={plan.flushSave}
      railFooter={
        <>
          <RawSdkPanel />
          <div style={{ marginTop: "auto" }}>
            <MeetingBadge meetingUUID={meetingUUID} sessionState={sessionState} role={role ?? undefined} />
          </div>
        </>
      }
    />
  );
}
