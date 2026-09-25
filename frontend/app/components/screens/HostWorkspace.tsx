"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { readSavedRoundPlan } from "@/lib/execution-api";
import { initialsFrom, type Participant } from "@/lib/participant-status";
import { copyRooms } from "@/lib/room-plan-copy";
import { useLiveRoomController } from "@/lib/use-live-room-controller";
import { useLiveState } from "@/lib/use-live-state";
import { useRoomPlan } from "@/lib/use-room-plan";
import { useRoundSummaries } from "@/lib/use-round-summaries";
import type { RoundTemplate } from "@/lib/round-templates";
import { roundLabel, useWorkspace } from "@/lib/use-workspace";
import type { LiveState, RoundMeta, Workspace, ZoomRole } from "@/types/breakout";

import LiveRound from "../LiveRound";
import MeetingBadge from "../MeetingBadge";
import Rooms from "../Rooms";
import { BrandMark, Button, Card, SectionLabel } from "../ui";
import LandingScreen from "./LandingScreen";
import RoundsOverview from "./RoundsOverview";
import TaskEditor from "./TaskEditor";

/** Host screens in flow order. A round is configured in two steps: draft, then task. */
type HostView = "landing" | "rounds" | "draft" | "task" | "live";

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
  // The round the host just launched. It keeps the live view on screen after the
  // round closes, when live.round is already null.
  const [launchedRoundId, setLaunchedRoundId] = useState<string | null>(null);
  const closedByTimer = useRef(false);
  const reconciled = useRef(false);

  // SSE is the authority on which round is running: a reopened app must find its
  // way back to the live view, not to the landing screen with a round still open.
  const runningRoundId = live.liveState?.round?.roundId ?? null;
  const liveRoundId = runningRoundId ?? launchedRoundId;
  const currentView: HostView = view === "landing" && runningRoundId ? "live" : view;

  const rounds = workspace.state.kind === "ready" ? workspace.state.workspace.rounds : [];
  const { plans, reload: reloadPlans } = useRoundSummaries(
    meetingUUID,
    rounds.map((round) => round.roundId),
    view,
  );
  const livePlan = liveRoundId ? (plans[liveRoundId] ?? null) : null;
  const nextRound = rounds[rounds.findIndex((round) => round.roundId === liveRoundId) + 1] ?? null;

  const controller = useLiveRoomController({
    parentUUID: meetingUUID,
    role,
    round: livePlan ?? {
      parentUUID: meetingUUID,
      roundId: liveRoundId ?? "",
      title: "This round",
      rooms: [],
      stayInMainParticipantUUIDs: [],
    },
    // Launching happens from saved drafts; the live view has no pending edits.
    flushSave: () => Promise.resolve(true),
    onLaunched: (roundId) => {
      setLaunchedRoundId(roundId);
      setView("live");
    },
    onClosed: () => {
      if (!closedByTimer.current) return;
      closedByTimer.current = false;
      if (nextRound) controller.launch(nextRound.roundId);
    },
  });

  // A round the backend still calls live may already be over in Zoom. Check once.
  useEffect(() => {
    if (!runningRoundId || reconciled.current) return;
    reconciled.current = true;
    controller.reconcile();
  }, [runningRoundId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The backend owns the clock: it flips timerEnded and pushes it over SSE.
  const timerEnded = live.liveState?.round?.timerEnded ?? false;
  const autoStart = workspace.state.kind === "ready" && workspace.state.workspace.autoStartNextRound;
  useEffect(() => {
    if (!timerEnded) return;
    closedByTimer.current = autoStart;
    controller.close();
  }, [timerEnded]); // eslint-disable-line react-hooks/exhaustive-deps

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
  if (currentView === "landing" || workspace.state.kind === "missing") {
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
  if (currentView === "live" && liveRoundId) {
    if (!livePlan || !live.liveState) {
      return (
        <HostShell meetingUUID={meetingUUID} role={role} heading="Live round">
          <Card tone="sunken" style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>Loading live round…</Card>
        </HostShell>
      );
    }
    return (
      <LiveRound
        workspace={workspace.state.workspace}
        round={livePlan}
        live={live.liveState}
        connected={live.isConnected}
        operation={controller.operation}
        nextRound={nextRound}
        onHome={() => setView("rounds")}
        onEndRound={controller.close}
        onLaunchNext={() => nextRound && controller.launch(nextRound.roundId)}
      />
    );
  }
  if (currentView === "rounds" || !workspace.selectedRound) {
    return (
      <RoundsOverview
        workspace={workspace.state.workspace}
        parentUUID={meetingUUID}
        plans={plans}
        onPlansChanged={reloadPlans}
        live={live.liveState}
        role={role}
        onLaunched={(roundId) => {
          setLaunchedRoundId(roundId);
          setView("live");
        }}
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

  if (currentView === "task") {
    const selected = workspace.selectedRound;
    const after = workspace.state.workspace.rounds[
      workspace.state.workspace.rounds.findIndex((r) => r.roundId === selected.roundId) + 1
    ];
    return (
      <TaskEditor
        workspace={workspace.state.workspace}
        round={selected}
        onBack={() => setView("draft")}
        onBackToRounds={() => setView("rounds")}
        onNext={() => {
          if (!after) return setView("rounds");
          workspace.selectRound(after.roundId);
          setView("draft");
        }}
        nextLabel={
          after
            ? `Next: ${roundLabel(workspace.state.workspace, after.roundId)}`
            : "Review & launch"
        }
      />
    );
  }

  return (
    <RoundEditor
      meetingUUID={meetingUUID}
      role={role}
      workspace={workspace.state.workspace}
      selectedRound={workspace.selectedRound}
      onSelectRound={workspace.selectRound}
      live={live}
      onChangeView={setView}
    />
  );
}

function RoundEditor({
  meetingUUID,
  role,
  workspace,
  selectedRound,
  onSelectRound,
  live,
  onChangeView,
}: {
  meetingUUID: string;
  role: ZoomRole | null;
  workspace: Workspace;
  selectedRound: RoundMeta;
  onSelectRound: (roundId: string) => void;
  live: ReturnType<typeof useLiveState>;
  onChangeView: (view: HostView) => void;
}) {
  const label = roundLabel(workspace, selectedRound.roundId);
  const firstRound = workspace.rounds[0];
  const carry = workspace.sameRoomsEveryRound || workspace.samePeopleEveryRound;
  const seedSource = carry && firstRound.roundId !== selectedRound.roundId ? firstRound : null;
  const seedLabel = seedSource ? roundLabel(workspace, seedSource.roundId) : null;

  // Only runs when this round has no saved draft yet. A missing first-round draft means an empty start.
  async function seedFromFirstRound() {
    if (!seedSource) return null;
    try {
      const source = await readSavedRoundPlan(meetingUUID, seedSource.roundId);
      return copyRooms(
        source,
        { parentUUID: meetingUUID, roundId: selectedRound.roundId, title: label },
        { withPeople: workspace.samePeopleEveryRound },
      );
    } catch {
      return null;
    }
  }

  const plan = useRoomPlan(meetingUUID, { roundId: selectedRound.roundId, title: label }, seedFromFirstRound);
  const nextRound =
    workspace.rounds[workspace.rounds.findIndex((r) => r.roundId === selectedRound.roundId) + 1] ?? null;

  if (plan.state.kind !== "ready") {
    return (
      <HostShell meetingUUID={meetingUUID} role={role} heading={`Rooms & people - ${label}`}>
        {plan.state.kind === "loading" ? (
          <Card tone="sunken" style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>
            {seedLabel ? `Configuring ${label} from ${seedLabel}…` : `Loading ${label} draft…`}
          </Card>
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
      onChangeView={onChangeView}
      onNext={() => onChangeView("task")}
      nextLabel="Next: Task & activities"
    />
  );
}

function ReadyRoundEditor({
  meetingUUID,
  role,
  plan,
  readyState,
  live,
  onChangeView,
  onNext,
  nextLabel,
}: {
  meetingUUID: string;
  role: ZoomRole | null;
  plan: ReturnType<typeof useRoomPlan>;
  readyState: Extract<ReturnType<typeof useRoomPlan>["state"], { kind: "ready" }>;
  live: ReturnType<typeof useLiveState>;
  onChangeView: (view: HostView) => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const round = readyState.draft;
  const { liveState } = live;
  const roster = rosterFrom(liveState);

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
      backLabel="Back to rounds"
      onNext={onNext}
      nextLabel={nextLabel}
      railFooter={
        <div style={{ marginTop: "auto" }}>
          <MeetingBadge meetingUUID={meetingUUID} role={role ?? undefined} />
        </div>
      }
    />
  );
}
