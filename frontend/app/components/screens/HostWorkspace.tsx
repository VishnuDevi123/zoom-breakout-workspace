"use client";

import { useState } from "react";

import { initialsFrom, type Participant } from "@/lib/participant-status";
import { useLiveRoomController } from "@/lib/use-live-room-controller";
import { useLiveState } from "@/lib/use-live-state";
import { useRoomPlan, type SelectedRound } from "@/lib/use-room-plan";
import type { LiveState, ZoomRole } from "@/types/breakout";

import LiveRound from "../LiveRound";
import MeetingBadge from "../MeetingBadge";
import Rooms from "../Rooms";
import RawSdkPanel from "../debug/RawSdkPanel";
import { Button, Card, SectionLabel } from "../ui";

const ROUND_ONE: SelectedRound = { roundId: "round-1", title: "Round 1" };

/** Adapt webhook-fed live participants to the shape the draft editor renders. */
function rosterFrom(live: LiveState | null): Participant[] {
  if (!live) return [];
  return live.participants.map((p) => ({
    participantUUID: p.participantUUID,
    assignmentEligible: p.location !== "left",
    displayName: p.name,
    initials: initialsFrom(p.name),
    status: p.location === "main" ? "unassigned" : p.location === "left" ? "left" : "in-room",
    roomId: null,
    isHost: p.isHost,
  }));
}

export default function HostWorkspace({
  meetingUUID,
  role,
}: {
  meetingUUID: string;
  role: ZoomRole | null;
}) {
  const plan = useRoomPlan(meetingUUID, ROUND_ONE);

  if (plan.state.kind !== "ready") {
    return (
      <div className="bw-shell">
        <header className="bw-header">
          <span className="bw-brand-mark">B</span>
          <div className="bw-round-heading">
            <span style={{ fontSize: 15, fontWeight: 600 }}>Rooms &amp; people - Round 1</span>
            <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>Draft room plan</span>
          </div>
          <div className="bw-header-spacer" />
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
                <span style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>{plan.state.message}</span>
                <Button variant="outline" size="sm" onClick={plan.retryLoad}>Retry load</Button>
              </Card>
            )}
          </main>
          <aside className="bw-rail">
            <div style={{ marginTop: "auto" }}>
              <MeetingBadge meetingUUID={meetingUUID} role={role ?? undefined} />
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <ReadyHostWorkspace
      meetingUUID={meetingUUID}
      role={role}
      plan={plan}
      readyState={plan.state}
    />
  );
}

function ReadyHostWorkspace({
  meetingUUID,
  role,
  plan,
  readyState,
}: {
  meetingUUID: string;
  role: ZoomRole | null;
  plan: ReturnType<typeof useRoomPlan>;
  readyState: Extract<ReturnType<typeof useRoomPlan>["state"], { kind: "ready" }>;
}) {
  const [view, setView] = useState<"draft" | "live">("draft");
  const round = readyState.draft;
  const controller = useLiveRoomController({
    parentUUID: meetingUUID,
    role,
    round,
    flushSave: plan.flushSave,
  });
  const { liveState, isConnected } = useLiveState(meetingUUID);
  const roster = rosterFrom(liveState);
  const launched = liveState?.round?.roundId === round.roundId;
  const busy = controller.operation.kind === "running";

  if (view === "live") {
    return (
      <LiveRound
        round={round}
        live={liveState}
        connected={isConnected}
        operation={controller.operation}
        onShowDraft={() => setView("draft")}
        onLaunch={controller.launch}
        onClose={controller.close}
      />
    );
  }

  return (
    <Rooms
      round={round}
      roster={roster}
      rosterKnown={liveState !== null}
      save={readyState.save}
      canAdd={plan.canAdd}
      onAddRoom={plan.addRoom}
      onRemoveRoom={plan.removeRoom}
      onRenameRoom={plan.renameRoom}
      onAssignParticipant={plan.assignParticipant}
      onUnassignParticipant={plan.unassignParticipant}
      onKeepParticipantInMain={plan.keepParticipantInMain}
      onAutoAssign={plan.autoAssignParticipants}
      onRetrySave={plan.retrySave}
      onReloadDraft={plan.reloadDraft}
      onBeforeNavigate={plan.flushSave}
      headerActions={
        <div className="bw-execution-actions">
          <Button variant="outline" size="sm" onClick={() => setView("live")}>Live rooms</Button>
          {launched ? (
            <Button size="sm" disabled={busy} onClick={controller.close}>Close {round.title}</Button>
          ) : (
            <Button variant="accent" size="sm" disabled={busy} onClick={controller.launch}>
              Launch {round.title}
            </Button>
          )}
        </div>
      }
      railFooter={
        <>
          {controller.operation.kind !== "idle" ? (
            <Card className={`bw-operation bw-operation--${controller.operation.kind}`}>
              <SectionLabel>{controller.operation.kind}</SectionLabel>
              <span>
                {controller.operation.kind === "running"
                  ? controller.operation.step
                  : controller.operation.message}
              </span>
            </Card>
          ) : null}
          {process.env.NODE_ENV === "development" ? <RawSdkPanel /> : null}
          <div style={{ marginTop: "auto" }}>
            <MeetingBadge meetingUUID={meetingUUID} role={role ?? undefined} />
          </div>
        </>
      }
    />
  );
}
