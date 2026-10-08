"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { readSavedRoundPlan, saveRoundPlan, setRoundSkipped } from "@/lib/execution-api";
import { initialsFrom, type Participant } from "@/lib/participant-status";
import { newPlacements } from "@/lib/room-plan-assignments";
import { copyRooms, groupsForLaunch } from "@/lib/room-plan-copy";
import { useLiveRoomController } from "@/lib/use-live-room-controller";
import { useLiveState } from "@/lib/use-live-state";
import { useRoomPlan } from "@/lib/use-room-plan";
import { useRoundTasks } from "@/lib/use-round-tasks";
import { useRoundSummaries } from "@/lib/use-round-summaries";
import type { RoundTemplate } from "@/lib/round-templates";
import { roundLabel, useWorkspace } from "@/lib/use-workspace";
import type { LiveState, RoundMeta, RoundPlanDraft, Workspace, ZoomRole } from "@/types/breakout";

import LiveRound from "../LiveRound";
import MeetingBadge from "../MeetingBadge";
import { BrandMark, Button, Card, SectionLabel } from "../ui";
import LandingScreen from "./LandingScreen";
import RoundsOverview from "./RoundsOverview";
import RoundSetup, { RoundSetupPending, type SetupTab } from "./RoundSetup";

/** Shortest time the round setup spinner shows, so quick loads read as a transition, not a flash. */
const SETUP_MIN_LOADING_MS = 300;

/**
 * Host screens in flow order. A round is configured in two steps: draft, then task.
 * "opening" is the landing page on first open, which jumps to a running round;
 * "landing" is the same page chosen on purpose, so it stays put.
 */
type HostView = "opening" | "landing" | "rounds" | "draft" | "task" | "live";

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
          <span className="bw-header-title">{heading}</span>
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
  role,
}: {
  meetingUUID: string;
  meetingTopic: string;
  role: ZoomRole | null;
}) {
  const workspace = useWorkspace(meetingUUID);
  const live = useLiveState(meetingUUID);
  const [view, setView] = useState<HostView>("opening");
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
  const currentView: HostView = view === "opening" ? (runningRoundId ? "live" : "landing") : view;

  const rounds = workspace.state.kind === "ready" ? workspace.state.workspace.rounds : [];
  const { plans, reload: reloadPlans } = useRoundSummaries(
    meetingUUID,
    rounds.map((round) => round.roundId),
    view,
  );
  const livePlan = liveRoundId ? (plans[liveRoundId] ?? null) : null;
  // The next round to run, not simply the next in the list: the host can skip
  // rounds mid-session, and a closed one has already had its turn.
  const nextRound =
    rounds
      .slice(rounds.findIndex((round) => round.roundId === liveRoundId) + 1)
      .find((round) => round.status === "planned") ?? null;

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
    prepareLaunch: copyGroupsForLaunch,
    onLaunched: (roundId, saved) => {
      if (saved) workspace.applyWorkspace(saved);
      setLaunchedRoundId(roundId);
      setView("live");
    },
    onClosed: (saved) => {
      if (saved) workspace.applyWorkspace(saved);
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

  // Once per app open: fill in people webhooks missed. With a round running, wait
  // for its plan, because Zoom's room names map back to planned rooms through it.
  const rosterSynced = useRef(false);
  const liveKnown = live.liveState !== null;
  useEffect(() => {
    if (rosterSynced.current || !liveKnown) return;
    if (runningRoundId && !livePlan) return;
    rosterSynced.current = true;
    controller.syncRoster();
  }, [liveKnown, runningRoundId, livePlan]); // eslint-disable-line react-hooks/exhaustive-deps

  // The backend owns the clock: it flips timerEnded and pushes it over SSE.
  const timerEnded = live.liveState?.round?.timerEnded ?? false;
  const autoStart = workspace.state.kind === "ready" && workspace.state.workspace.autoStartNextRound;
  useEffect(() => {
    if (!timerEnded) return;
    closedByTimer.current = autoStart;
    controller.close();
  }, [timerEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom first, then the plan: a participant's own app finds their room through the saved plan.
  // With "Same groups" the next round copies this plan at launch, so the placement carries over.
  async function placeInLiveRound(next: RoundPlanDraft) {
    if (!livePlan) return;
    try {
      await controller.placeInOpenRooms(newPlacements(livePlan, next));
      await saveRoundPlan(meetingUUID, next, livePlan.revision);
    } catch (error) {
      toast.error("Could not place everyone.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
    reloadPlans();
  }

  /**
   * "Same groups": a round takes its rooms and people from the round that ran
   * last, at launch time, so room changes and mid-round placements carry
   * forward and a copy never goes stale. Other modes launch their own plans.
   */
  async function copyGroupsForLaunch(roundId: string) {
    if (workspace.state.kind !== "ready") return;
    const current = workspace.state.workspace;
    if (!current.sameRoomsEveryRound || !current.samePeopleEveryRound) return;
    const index = current.rounds.findIndex((round) => round.roundId === roundId);
    if (index <= 0) return;
    const ran = current.rounds
      .slice(0, index)
      .reverse()
      .find((round) => round.status === "closed" || round.status === "launched");
    const source = await readSavedRoundPlan(meetingUUID, (ran ?? current.rounds[0]).roundId);
    const present = live.liveState
      ? new Set(live.liveState.participants.filter((p) => p.location !== "left").map((p) => p.participantUUID))
      : null;
    const target = { parentUUID: meetingUUID, roundId, title: roundLabel(current, roundId) };
    const existing = await readSavedRoundPlan(meetingUUID, roundId).catch(() => null);
    await saveRoundPlan(meetingUUID, groupsForLaunch(source, target, present), existing?.revision ?? 0);
  }

  /** Runs a live-page action and turns a failure into a toast; the caller's spinner then stops. */
  async function reportFailure(failure: string, action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(failure, { description: error instanceof Error ? error.message : undefined });
    }
  }

  // A round added mid-session takes the last round's rooms and time, and its
  // people too when the workflow keeps the same people every round.
  async function addLiveRound() {
    const last = rounds.at(-1);
    await reportFailure("Could not add a round.", async () => {
      const saved = await workspace.addRound({ durationSec: last?.durationSec });
      const added = saved.rounds.at(-1);
      if (!added) return;
      const label = roundLabel(saved, added.roundId);
      const source = last ? plans[last.roundId] : null;
      if (source) {
        const target = { parentUUID: meetingUUID, roundId: added.roundId, title: label };
        await saveRoundPlan(meetingUUID, copyRooms(source, target, { withPeople: saved.samePeopleEveryRound }), 0);
      }
      toast.success(`${label} added.`);
    });
    reloadPlans();
  }

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
        <Card tone="sunken" style={{ fontSize: "var(--bw-fs-secondary)", color: "var(--bw-muted-2)" }}>Loading rounds…</Card>
      </HostShell>
    );
  }
  if (workspace.state.kind === "error") {
    return (
      <HostShell meetingUUID={meetingUUID} role={role} heading="Breakout Workspace">
        <Card style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
          <SectionLabel>Workspace load failed</SectionLabel>
          <span style={{ fontSize: "var(--bw-fs-secondary)", color: "var(--bw-muted-2)" }}>{workspace.state.message}</span>
          <Button variant="secondary" size="sm" onClick={workspace.reload}>Retry load</Button>
        </Card>
      </HostShell>
    );
  }
  if (currentView === "landing" || workspace.state.kind === "missing") {
    return (
      <LandingScreen
        meetingTopic={meetingTopic}
        participantCount={presentCount(live.liveState)}
        workflow={
          workspace.state.kind === "ready"
            ? { title: workspace.state.workspace.title, roundCount: workspace.state.workspace.rounds.length }
            : null
        }
        liveRoundLabel={
          runningRoundId && workspace.state.kind === "ready" ? roundLabel(workspace.state.workspace, runningRoundId) : null
        }
        busy={starting}
        onReturnToLive={() => setView("live")}
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
          <Card tone="sunken" style={{ fontSize: "var(--bw-fs-secondary)", color: "var(--bw-muted-2)" }}>Loading live round…</Card>
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
        // The logo goes home; the landing page offers the way back to this round.
        onHome={() => setView("landing")}
        onSkipRound={(roundId, skipped) =>
          reportFailure("Could not change that round.", async () =>
            workspace.applyWorkspace(await setRoundSkipped(meetingUUID, roundId, skipped)),
          )
        }
        onEndRound={controller.close}
        onLaunchNext={() => nextRound && controller.launch(nextRound.roundId)}
        onPlace={placeInLiveRound}
        plans={plans}
        onAddRound={addLiveRound}
        onUpdateRound={(roundId, patch) =>
          reportFailure("Could not change that round.", () => workspace.updateRound(roundId, patch))
        }
        onDeleteRound={(roundId) =>
          reportFailure("Could not delete that round.", () => workspace.deleteRound(roundId))
        }
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
        onAddRound={async () => void (await workspace.addRound())}
        onDeleteRound={workspace.deleteRound}
        onUpdateRound={workspace.updateRound}
        onUpdateWorkspace={workspace.updateWorkspace}
        prepareLaunch={copyGroupsForLaunch}
        onEditRound={(roundId, tab) => {
          workspace.selectRound(roundId);
          setView(tab === "tasks" ? "task" : "draft");
        }}
      />
    );
  }

  const selected = workspace.selectedRound;
  return (
    <RoundEditor
      // A new round starts fresh: its own short loading pause and fade-in.
      key={selected.roundId}
      meetingUUID={meetingUUID}
      workspace={workspace.state.workspace}
      selectedRound={selected}
      live={live}
      tab={currentView === "task" ? "tasks" : "rooms"}
      onTabChange={(tab) => setView(tab === "tasks" ? "task" : "draft")}
      onRename={(title) => void workspace.updateRound(selected.roundId, { title })}
      onBack={() => setView("rounds")}
      onSelectRound={(roundId) => {
        workspace.selectRound(roundId);
        setView("draft");
      }}
    />
  );
}

/** One round's setup: loads its draft (seeded from Round 1 when asked), then the Rooms | Tasks screen. */
function RoundEditor({
  meetingUUID,
  workspace,
  selectedRound,
  live,
  tab,
  onTabChange,
  onRename,
  onBack,
  onSelectRound,
}: {
  meetingUUID: string;
  workspace: Workspace;
  selectedRound: RoundMeta;
  live: ReturnType<typeof useLiveState>;
  tab: SetupTab;
  onTabChange: (tab: SetupTab) => void;
  onRename: (title: string | null) => void;
  onBack: () => void;
  onSelectRound: (roundId: string) => void;
}) {
  const label = roundLabel(workspace, selectedRound.roundId);
  const position = workspace.rounds.findIndex((r) => r.roundId === selectedRound.roundId) + 1;
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
  // A load that finishes instantly would flash the spinner; hold it for a moment instead.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETUP_MIN_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);
  const tasks = useRoundTasks(meetingUUID, selectedRound.roundId);
  const nextRound = workspace.rounds[position] ?? null;
  // "Same groups": later rounds get their rooms at launch, so only Tasks is set up here.
  const roomsLocked = workspace.sameRoomsEveryRound && workspace.samePeopleEveryRound && position > 1;
  const shownTab: SetupTab = roomsLocked ? "tasks" : tab;

  if (plan.state.kind !== "ready" || !settled) {
    const failed = plan.state.kind === "load-error";
    return (
      <RoundSetupPending
        heading={selectedRound.title ?? `Round ${position}`}
        tab={shownTab}
        failed={failed}
        message={
          plan.state.kind === "load-error"
            ? plan.state.message
            : seedLabel
              ? `Setting up ${label} from ${seedLabel}…`
              : `Loading ${label}…`
        }
        onRetry={plan.retryLoad}
        onBack={onBack}
        onTabChange={onTabChange}
      />
    );
  }

  return (
    <RoundSetup
      title={selectedRound.title}
      placeholder={`Round ${position}`}
      tab={shownTab}
      roomsLocked={roomsLocked}
      plan={plan}
      draft={plan.state}
      tasks={tasks}
      roster={rosterFrom(live.liveState)}
      rosterKnown={live.liveState !== null}
      nextLabel={nextRound ? "Next round ›" : "Done"}
      onTabChange={onTabChange}
      onRename={onRename}
      onBack={onBack}
      onNext={() => (nextRound ? onSelectRound(nextRound.roundId) : onBack())}
    />
  );
}
