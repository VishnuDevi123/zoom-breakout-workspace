"use client";

import { useState } from "react";
import { toast } from "sonner";

import { initialsFrom, type Participant } from "@/lib/participant-status";
import { useLiveRoomController } from "@/lib/use-live-room-controller";
import { useLiveState } from "@/lib/use-live-state";
import { useRoomPlan } from "@/lib/use-room-plan";
import type { RoundTemplate } from "@/lib/round-templates";
import { roundLabel, useWorkspace } from "@/lib/use-workspace";
import type { LiveState, RoundMeta, Workspace, ZoomRole } from "@/types/breakout";

import LiveRound from "../LiveRound";
import MeetingBadge from "../MeetingBadge";
import Rooms from "../Rooms";
import { BrandMark, Button, Card, SectionLabel } from "../ui";
import LandingScreen from "./LandingScreen";
import RoundsOverview from "./RoundsOverview";

/** Host screens in flow order. Later steps add rounds and review. */
type HostView = "landing" | "rounds" | "draft" | "live";

/** People who can be placed: everyone Zoom still reports in the meeting. */
function presentCount(live: LiveState | null): number | null {
  if (!live) return null;
  return live.participants.filter((p) => p.location !== "left").length;
}

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

/** Shell shown while nothing is editable yet: loading, errors, empty workspace. */
function HostShell({
  meetingUUID,
  role,
  heading,
  children,
}: {
  meetingUUID: string;
  role: ZoomRole | null;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bw-shell">
      <header className="bw-header">
        <BrandMark />
        <div className="bw-round-heading">
          <span style={{ fontSize: 15, fontWeight: 600 }}>{heading}</span>
        </div>
        <div className="bw-header-spacer" />
      </header>
      <div className="bw-body">
        <main className="bw-main">{children}</main>
        <aside className="bw-rail">
          <div style={{ marginTop: "auto" }}>
            <MeetingBadge meetingUUID={meetingUUID} role={role ?? undefined} />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function HostWorkspace({
  meetingUUID,
  meetingTopic,
  screenName,
  role,
}: {
  meetingUUID: string;
  meetingTopic: string;
  screenName: string;
  role: ZoomRole | null;
}) {
  const workspace = useWorkspace(meetingUUID);
  const live = useLiveState(meetingUUID);
  const [view, setView] = useState<HostView>("landing");
  const [starting, setStarting] = useState(false);

  const workspaceTitle = "Sample Workflow";

  async function start(create: () => Promise<void>, next: HostView) {
    setStarting(true);
    try {
      await create();
      setView(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the workspace.");
    } finally {
      setStarting(false);
    }
  }

  function startRoundOne() {
    if (workspace.state.kind === "missing") return void start(() => workspace.createWithFirstRound(workspaceTitle), "draft");
    setView("draft");
  }

  function buildRounds() {
    if (workspace.state.kind === "missing") return void start(() => workspace.createEmpty(workspaceTitle), "rounds");
    setView("rounds");
  }

  function useTemplate(template: RoundTemplate) {
    void start(() => workspace.createFromTemplate(workspaceTitle, template), "rounds");
  }

  if (workspace.state.kind === "loading") {
    return (
      <HostShell meetingUUID={meetingUUID} role={role} heading="Breakout Workspace">
        <Card tone="sunken" style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>Loading rounds…</Card>
      </HostShell>
    );
  }
  if (workspace.state.kind === "error") {
    return (
      <HostShell meetingUUID={meetingUUID} role={role} heading="Breakout Workspace">
        <Card style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
          <SectionLabel>Workspace load failed</SectionLabel>
          <span style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>{workspace.state.message}</span>
          <Button variant="outline" size="sm" onClick={workspace.reload}>Retry load</Button>
        </Card>
      </HostShell>
    );
  }
  if (view === "landing" || workspace.state.kind === "missing") {
    return (
      <LandingScreen
        meetingTopic={meetingTopic}
        hostName={screenName}
        participantCount={presentCount(live.liveState)}
        roundCount={workspace.state.kind === "ready" ? workspace.state.workspace.rounds.length : null}
        busy={starting}
        onStartRoundOne={startRoundOne}
        onBuildRounds={buildRounds}
        onUseTemplate={useTemplate}
      />
    );
  }
  if (view === "rounds" || !workspace.selectedRound) {
    return (
      <RoundsOverview
        workspace={workspace.state.workspace}
        onHome={() => setView("landing")}
        onAddRound={workspace.addRound}
        onDeleteRound={workspace.deleteRound}
        onUpdateRound={workspace.updateRound}
        onUpdateWorkspace={workspace.updateWorkspace}
        onEditRound={(roundId) => {
          workspace.selectRound(roundId);
          setView("draft");
        }}
      />
    );
  }

  return (
    <RoundEditor
      meetingUUID={meetingUUID}
      role={role}
      workspace={workspace.state.workspace}
      selectedRound={workspace.selectedRound}
      live={live}
      view={view}
      onChangeView={setView}
    />
  );
}

function RoundEditor({
  meetingUUID,
  role,
  workspace,
  selectedRound,
  live,
  view,
  onChangeView,
}: {
  meetingUUID: string;
  role: ZoomRole | null;
  workspace: Workspace;
  selectedRound: RoundMeta;
  live: ReturnType<typeof useLiveState>;
  view: HostView;
  onChangeView: (view: HostView) => void;
}) {
  const label = roundLabel(workspace, selectedRound.roundId);
  const plan = useRoomPlan(meetingUUID, { roundId: selectedRound.roundId, title: label });

  if (plan.state.kind !== "ready") {
    return (
      <HostShell meetingUUID={meetingUUID} role={role} heading={`Rooms & people - ${label}`}>
        {plan.state.kind === "loading" ? (
          <Card tone="sunken" style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>Loading {label} draft…</Card>
        ) : (
          <Card style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
            <SectionLabel>Draft load failed</SectionLabel>
            <span style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>{plan.state.message}</span>
            <Button variant="outline" size="sm" onClick={plan.retryLoad}>Retry load</Button>
          </Card>
        )}
      </HostShell>
    );
  }

  return (
    <ReadyRoundEditor
      meetingUUID={meetingUUID}
      role={role}
      plan={plan}
      readyState={plan.state}
      live={live}
      view={view}
      onChangeView={onChangeView}
    />
  );
}

function ReadyRoundEditor({
  meetingUUID,
  role,
  plan,
  readyState,
  live,
  view,
  onChangeView,
}: {
  meetingUUID: string;
  role: ZoomRole | null;
  plan: ReturnType<typeof useRoomPlan>;
  readyState: Extract<ReturnType<typeof useRoomPlan>["state"], { kind: "ready" }>;
  live: ReturnType<typeof useLiveState>;
  view: HostView;
  onChangeView: (view: HostView) => void;
}) {
  const round = readyState.draft;
  const controller = useLiveRoomController({
    parentUUID: meetingUUID,
    role,
    round,
    flushSave: plan.flushSave,
  });
  const { liveState, isConnected } = live;
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
        onShowDraft={() => onChangeView("draft")}
        onHome={() => onChangeView("landing")}
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
      onHome={() => onChangeView("landing")}
      onBack={() => onChangeView("rounds")}
      headerActions={
        <div className="bw-execution-actions">
          <Button variant="outline" size="sm" onClick={() => onChangeView("live")}>Live rooms</Button>
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
        <div style={{ marginTop: "auto" }}>
          <MeetingBadge meetingUUID={meetingUUID} role={role ?? undefined} />
        </div>
      }
    />
  );
}
