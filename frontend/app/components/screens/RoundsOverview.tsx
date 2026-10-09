"use client";

import { useState } from "react";
import { toast } from "sonner";

import { readRoundTasks, readSavedRoundPlan, saveRoundPlan } from "@/lib/execution-api";
import { rebalanceEvenly, shuffleEvenly } from "@/lib/room-plan-assignments";
import { copyRooms } from "@/lib/room-plan-copy";
import { useLiveRoomController } from "@/lib/use-live-room-controller";
import { MAX_ROOMS, newRoom } from "@/lib/use-room-plan";
import { roundLabel } from "@/lib/use-workspace";
import type {
  LiveState,
  RoundMeta,
  RoundPlan,
  RoundPlanDraft,
  Workspace,
  ZoomRole,
} from "@/types/breakout";

import SaveTemplateModal from "../SaveTemplateModal";
import ZoomActionOverlay from "../ZoomActionOverlay";
import type { SetupTab } from "./RoundSetup";
import { Button, Card, ConfirmModal, EditableName, SectionLabel } from "../ui";

const DURATION_STEP_SEC = 30;
const MIN_DURATION_SEC = 30;

/** How rounds get their groups. Stored as the workspace's two existing flags. */
type Grouping = "same" | "new" | "each";

const GROUPING_OPTIONS: { id: Grouping; label: string; hint: string }[] = [
  { id: "same", label: "Same groups every round", hint: "Set rooms and people once, in Round 1." },
  { id: "new", label: "New groups each round", hint: "Same rooms, people mixed up each round." },
  { id: "each", label: "I'll set up each round", hint: "Every round has its own rooms and people." },
];

const GROUPING_FLAGS: Record<Grouping, Pick<Workspace, "sameRoomsEveryRound" | "samePeopleEveryRound">> = {
  same: { sameRoomsEveryRound: true, samePeopleEveryRound: true },
  new: { sameRoomsEveryRound: true, samePeopleEveryRound: false },
  each: { sameRoomsEveryRound: false, samePeopleEveryRound: false },
};

/** Same people without the same rooms has no meaning, so it reads as "each round". */
function groupingOf(workspace: Workspace): Grouping {
  if (!workspace.sameRoomsEveryRound) return "each";
  return workspace.samePeopleEveryRound ? "same" : "new";
}

/** Grow or shrink a draft to exactly `count` rooms. Shrinking unassigns whoever was in the last rooms. */
function withRoomCount(draft: RoundPlanDraft, count: number): RoundPlanDraft {
  const rooms = [...draft.rooms];
  while (rooms.length < count) rooms.push(newRoom(rooms));
  return { ...draft, rooms: rooms.slice(0, count) };
}

function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Rounds overview: order, titles and timing. Rooms are planned per round in the editor. */
export default function RoundsOverview({
  workspace,
  parentUUID,
  plans,
  onPlansChanged,
  live,
  role,
  onLaunched,
  onHome,
  onAddRound,
  onDeleteRound,
  onUpdateRound,
  onUpdateWorkspace,
  onEditRound,
  prepareLaunch,
  onSaveTemplate,
}: {
  workspace: Workspace;
  parentUUID: string;
  /** Saved draft per round, fetched by HostWorkspace. Null means never configured. */
  plans: Record<string, RoundPlan | null>;
  onPlansChanged: () => void;
  live: LiveState | null;
  role: ZoomRole | null;
  onLaunched: (roundId: string) => void;
  onHome: () => void;
  onAddRound: () => Promise<void>;
  onDeleteRound: (roundId: string) => Promise<void>;
  onUpdateRound: (roundId: string, patch: Partial<Pick<RoundMeta, "title" | "durationSec">>) => Promise<void>;
  onUpdateWorkspace: (
    patch: Partial<
      Pick<Workspace, "title" | "sameRoomsEveryRound" | "samePeopleEveryRound" | "autoStartNextRound">
    >,
  ) => Promise<void>;
  onEditRound: (roundId: string, tab: SetupTab) => void;
  /** Saves this workflow, without people, to the host's templates. Reports its own errors. */
  onSaveTemplate: () => Promise<void>;
  /** Writes a round's plan just before launch ("Same groups" copies the last round's groups). */
  prepareLaunch: (roundId: string) => Promise<void>;
}) {
  const totalSec = workspace.rounds.reduce((sum, round) => sum + round.durationSec, 0);
  const anyLaunched = workspace.rounds.some((round) => round.status === "launched");
  // The round the host would start now: the first one Zoom has not run yet.
  // A skipped round is one the host chose not to run, so the rail steps over it.
  const target =
    workspace.rounds.find((round) => round.status !== "closed" && round.status !== "skipped") ??
    null;

  const [applying, setApplying] = useState(false);
  // Everyone Zoom still reports in the meeting. The host is never placed in a room.
  const eligibleUUIDs = (live?.participants ?? [])
    .filter((participant) => participant.location !== "left" && !participant.isHost)
    .map((participant) => participant.participantUUID);

  /** First draft for a round nobody has configured: seeded from round 1 when the host asked for that. */
  function startingDraft(round: RoundMeta): RoundPlanDraft {
    const empty: RoundPlanDraft = {
      parentUUID,
      roundId: round.roundId,
      title: roundLabel(workspace, round.roundId),
      rooms: [],
      stayInMainParticipantUUIDs: [],
    };
    const first = workspace.rounds[0];
    const source = first && first.roundId !== round.roundId ? plans[first.roundId] : null;
    if (!source || !workspace.sameRoomsEveryRound) return empty;
    return copyRooms(source, empty, { withPeople: workspace.samePeopleEveryRound });
  }

  /** Write one round's draft. The editor may have saved since this page loaded, so a stale revision retries once. */
  async function writePlan(round: RoundMeta, change: (draft: RoundPlanDraft) => RoundPlanDraft) {
    const known = plans[round.roundId] ?? null;
    try {
      await saveRoundPlan(parentUUID, change(known ?? startingDraft(round)), known?.revision ?? 0);
    } catch (error) {
      const fresh = await readSavedRoundPlan(parentUUID, round.roundId).catch(() => null);
      if (!fresh) throw error;
      await saveRoundPlan(parentUUID, change(fresh), fresh.revision);
    }
  }

  /**
   * Apply one change to every round that has not run. A launched round's rooms are
   * open in Zoom, and a closed round's plan decides who may read its submissions.
   */
  async function applyToAllRounds(change: (draft: RoundPlanDraft) => RoundPlanDraft, done: string) {
    setApplying(true);
    try {
      const editable = workspace.rounds.filter((round) => round.status === "planned" || round.status === "skipped");
      for (const round of editable) await writePlan(round, change);
      onPlansChanged();
      toast.success(done);
    } catch (error) {
      onPlansChanged();
      toast.error(error instanceof Error ? error.message : "Could not save the rooms.");
    } finally {
      setApplying(false);
    }
  }

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workspace update failed.");
    }
  }

  const grouping = groupingOf(workspace);
  const firstRoundId = workspace.rounds[0]?.roundId ?? null;
  // "Same groups": a later round launches with the groups of the round before it,
  // so readiness looks at the last round that ran, or Round 1.
  function groupsSourceFor(roundId: string): string {
    if (grouping !== "same" || roundId === firstRoundId) return roundId;
    const index = workspace.rounds.findIndex((round) => round.roundId === roundId);
    const ran = workspace.rounds
      .slice(0, index)
      .reverse()
      .find((round) => round.status === "closed" || round.status === "launched");
    return (ran ?? workspace.rounds[0]).roundId;
  }

  return (
    <div className="bw-shell">
      <header className="bw-header">
        <button
          type="button"
          className="bw-back"
          aria-label="Back to start"
          onClick={onHome}
        >
          ←
        </button>
        <div className="bw-round-heading">
          <EditableName
            value={workspace.title}
            placeholder="Sample Workflow"
            className="bw-workspace-title"
            onSave={(title) =>
              void run(() =>
                onUpdateWorkspace({ title: title ?? "Sample Workflow" }),
              )
            }
          />
          <span className="bw-header-subtitle">
            {anyLaunched
              ? "A round is live"
              : `Draft · ${workspace.rounds.length} ${workspace.rounds.length === 1 ? "round" : "rounds"} · ${formatDuration(totalSec)}`}
          </span>
        </div>
        <div className="bw-header-spacer" />
      </header>

      <div className="bw-body bw-workflow">
        <main className="bw-main">
          <SectionLabel>Rounds</SectionLabel>
          <div className="bw-round-list">
            {workspace.rounds.map((round, index) => (
              <RoundRow
                key={round.roundId}
                round={round}
                position={index + 1}
                plan={plans[round.roundId] ?? null}
                groupsFromFirst={
                  grouping === "same" && round.roundId !== firstRoundId
                }
                onRename={(title) =>
                  run(() => onUpdateRound(round.roundId, { title }))
                }
                onDuration={(durationSec) =>
                  run(() => onUpdateRound(round.roundId, { durationSec }))
                }
                onDelete={() => run(() => onDeleteRound(round.roundId))}
                onOpen={(tab) => onEditRound(round.roundId, tab)}
              />
            ))}
            <button
              type="button"
              className="bw-add-round"
              onClick={() => void run(onAddRound)}
            >
              + Add round
            </button>
          </div>
        </main>

        <aside className="bw-rail bw-workflow__settings">
          <SectionLabel>How should groups work?</SectionLabel>
          <div
            className="bw-choice-list"
            role="radiogroup"
            aria-label="How should groups work?"
          >
            {GROUPING_OPTIONS.map((option) => (
              <label className="bw-choice" key={option.id}>
                <input
                  type="radio"
                  name="grouping"
                  checked={grouping === option.id}
                  onChange={() =>
                    void run(() => onUpdateWorkspace(GROUPING_FLAGS[option.id]))
                  }
                />
                <span className="bw-choice__text">
                  <span className="bw-choice__label">{option.label}</span>
                  <span className="bw-choice__hint">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {grouping === "each" ? null : (
            <>
              <SectionLabel>Every round</SectionLabel>
              <RoomsForEveryRound
                busy={applying}
                onApply={(count) =>
                  void applyToAllRounds(
                    (draft) => withRoomCount(draft, count),
                    `Every round now has ${count} ${count === 1 ? "room" : "rooms"}.`,
                  )
                }
              />
              <Button
                variant="secondary"
                size="sm"
                busy={applying}
                disabled={eligibleUUIDs.length === 0}
                title={
                  eligibleUUIDs.length > 0
                    ? undefined
                    : "Waiting for people to join."
                }
                onClick={() =>
                  void applyToAllRounds(
                    (draft) =>
                      rebalanceEvenly(
                        draft.rooms.length === 0
                          ? withRoomCount(draft, 1)
                          : draft,
                        eligibleUUIDs,
                      ),
                    "People spread evenly across every round.",
                  )
                }
              >
                Auto-assign evenly
              </Button>
              {grouping === "new" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  busy={applying}
                  disabled={eligibleUUIDs.length === 0}
                  title={
                    eligibleUUIDs.length > 0
                      ? undefined
                      : "Waiting for people to join."
                  }
                  onClick={() =>
                    void applyToAllRounds(
                      (draft) =>
                        shuffleEvenly(
                          draft.rooms.length === 0
                            ? withRoomCount(draft, 1)
                            : draft,
                          eligibleUUIDs,
                        ),
                      "Every round now has its own mix of people.",
                    )
                  }
                >
                  Shuffle people into every round
                </Button>
              ) : null}
            </>
          )}

          <label className="bw-switch-row">
            <input
              type="checkbox"
              checked={workspace.autoStartNextRound}
              onChange={(event) =>
                void run(() =>
                  onUpdateWorkspace({
                    autoStartNextRound: event.target.checked,
                  }),
                )
              }
            />
            <span>Start the next round when the timer ends</span>
          </label>
          <div className="bw-workflow__actions">
            <LaunchWorkflow
              workspace={workspace}
              parentUUID={parentUUID}
              role={role}
              target={target}
              plan={
                target ? (plans[groupsSourceFor(target.roundId)] ?? null) : null
              }
              presentUUIDs={eligibleUUIDs}
              prepareLaunch={prepareLaunch}
              onLaunched={onLaunched}
            >
              <SaveAsTemplate
                workspace={workspace}
                parentUUID={parentUUID}
                plans={plans}
                grouping={grouping}
                onSave={onSaveTemplate}
              />
            </LaunchWorkflow>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * What a template needs before it can be saved: rooms in every round that
 * launches with its own. In "Same groups" later rounds copy Round 1 at launch.
 */
function templateBlocker(workspace: Workspace, plans: Record<string, RoundPlan | null>, grouping: Grouping) {
  if (workspace.rounds.length === 0) return "Add a round to save a template.";
  const needRooms = grouping === "same" ? workspace.rounds.slice(0, 1) : workspace.rounds;
  const missing = needRooms.find((round) => (plans[round.roundId]?.rooms.length ?? 0) === 0);
  return missing ? `${roundLabel(workspace, missing.roundId)} has no rooms yet.` : null;
}

/** Saves the workflow being built as a template, after the same confirmation a past workflow gets. */
function SaveAsTemplate({
  workspace,
  parentUUID,
  plans,
  grouping,
  onSave,
}: {
  workspace: Workspace;
  parentUUID: string;
  plans: Record<string, RoundPlan | null>;
  grouping: Grouping;
  onSave: () => Promise<void>;
}) {
  // Activities live in each round's task, which this page does not load; count them on open.
  const [activities, setActivities] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const blocker = templateBlocker(workspace, plans, grouping);
  const rooms = workspace.rounds.reduce((sum, round) => sum + (plans[round.roundId]?.rooms.length ?? 0), 0);

  async function open() {
    setCounting(true);
    try {
      const tasks = await Promise.all(workspace.rounds.map((round) => readRoundTasks(parentUUID, round.roundId)));
      setActivities(tasks.reduce((sum, task) => sum + (task?.activities.length ?? 0), 0));
    } catch (error) {
      toast.error("Could not read the rounds' tasks.", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setCounting(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        disabled={Boolean(blocker)}
        busy={counting}
        title={blocker ?? undefined}
        onClick={() => void open()}
      >
        Save as template
      </Button>

      {activities !== null ? (
        <SaveTemplateModal
          title={workspace.title}
          rounds={workspace.rounds.length}
          rooms={rooms}
          activities={activities}
          onConfirm={onSave}
          onClose={() => setActivities(null)}
        />
      ) : null}
    </>
  );
}

/** What stops a launch, or only deserves a warning. */
function readiness(workspace: Workspace, target: RoundMeta | null, plan: RoundPlan | null, presentUUIDs: string[]) {
  if (workspace.rounds.length === 0 || !target) return { blocker: "Add a round to launch.", unplaced: 0 };
  const label = roundLabel(workspace, target.roundId);
  if (target.status === "launched") return { blocker: `${label} is already running.`, unplaced: 0 };
  if (!plan || plan.rooms.length === 0) return { blocker: `${label} has no rooms yet.`, unplaced: 0 };
  const planned = new Set([...plan.rooms.flatMap((room) => room.participantUUIDs), ...plan.stayInMainParticipantUUIDs]);
  return { blocker: null, unplaced: presentUUIDs.filter((uuid) => !planned.has(uuid)).length };
}

/**
 * Starts the first round that has not run yet, after a confirmation. Always
 * visible; disabled with the reason shown until the round can actually launch.
 */
function LaunchWorkflow({
  workspace,
  parentUUID,
  role,
  target,
  plan,
  presentUUIDs,
  prepareLaunch,
  onLaunched,
  children,
}: {
  workspace: Workspace;
  parentUUID: string;
  role: ZoomRole | null;
  target: RoundMeta | null;
  /** The plan the round will launch with: its own, or in "Same groups" the one it copies. */
  plan: RoundPlan | null;
  presentUUIDs: string[];
  prepareLaunch: (roundId: string) => Promise<void>;
  onLaunched: (roundId: string) => void;
  /** Shown between the readiness list and the Launch button (Save as template). */
  children: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const label = target ? roundLabel(workspace, target.roundId) : "";
  const controller = useLiveRoomController({
    parentUUID,
    role,
    round: plan ?? { parentUUID, roundId: target?.roundId ?? "", title: label, rooms: [], stayInMainParticipantUUIDs: [] },
    // Drafts are saved by the editor; the overview has no pending edits to flush.
    flushSave: () => Promise.resolve(true),
    prepareLaunch,
    onLaunched,
  });
  const { blocker, unplaced } = readiness(workspace, target, plan, presentUUIDs);
  const roomCount = plan?.rooms.length ?? 0;
  const placed = plan?.rooms.reduce((sum, room) => sum + room.participantUUIDs.length, 0) ?? 0;
  const position = target ? workspace.rounds.findIndex((round) => round.roundId === target.roundId) + 1 : 0;
  // "Round 2 of 3", plus the host's own name for it when it has one.
  const which = `Round ${position} of ${workspace.rounds.length}${label === `Round ${position}` ? "" : ` (${label})`}`;

  return (
    <div className="bw-launch">
      {!blocker ? (
        <ul className="bw-readiness">
          <li className="bw-readiness__item bw-readiness__item--ok">
            {label} has {roomCount} {roomCount === 1 ? "room" : "rooms"}
          </li>

          {unplaced > 0 ? (
            <li className="bw-readiness__item bw-readiness__item--warn">
              {unplaced} {unplaced === 1 ? "person is" : "people are"} not
              placed and will stay in the main room
            </li>
          ) : null}
        </ul>
      ) : null}
      {children}
      <Button
        variant="primary"
        disabled={Boolean(blocker)}
        busy={controller.operation.kind === "running"}
        title={blocker ?? undefined}
        onClick={() => setConfirming(true)}
      >
        Launch workflow
      </Button>

      {confirming && target ? (
        <ConfirmModal
          title="Launch this workflow?"
          message={
            `${which} · ${formatDuration(target.durationSec)} · ${roomCount} ${roomCount === 1 ? "room" : "rooms"}. ` +
            `${placed} placed${unplaced > 0 ? ` · ${unplaced} not placed (stays in the main room)` : ""}. ` +
            "Zoom opens the rooms and moves everyone in."
          }
          confirmLabel="Launch"
          confirmVariant="primary"
          onConfirm={async () => controller.launch()}
          onClose={() => setConfirming(false)}
        />
      ) : null}
      <ZoomActionOverlay operation={controller.operation} />
    </div>
  );
}

/** Small box in the rail: one room count for every round at once. */
function RoomsForEveryRound({
  busy,
  onApply,
}: {
  busy: boolean;
  onApply: (count: number) => void;
}) {
  const [value, setValue] = useState("3");
  const count = Number(value);
  const valid = Number.isInteger(count) && count >= 1 && count <= MAX_ROOMS;

  return (
    <div className="bw-switch-row">
      <span>Rooms per round</span>
      <input
        type="number"
        min={1}
        max={MAX_ROOMS}
        value={value}
        aria-label="Rooms in every round"
        className="bw-rooms-input bw-mono"
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={busy || !valid}
        title={valid ? undefined : `Enter 1 to ${MAX_ROOMS}.`}
        onClick={() => onApply(count)}
      >
        Apply
      </Button>
    </div>
  );
}

function RoundRow({
  round,
  position,
  plan,
  groupsFromFirst,
  onRename,
  onDuration,
  onDelete,
  onOpen,
}: {
  round: RoundMeta;
  position: number;
  plan: RoundPlan | null;
  /** "Same groups": this round launches with the previous round's rooms and people, so it has no Rooms button. */
  groupsFromFirst: boolean;
  onRename: (title: string | null) => void;
  onDuration: (durationSec: number) => void;
  onDelete: () => void;
  onOpen: (tab: SetupTab) => void;
}) {
  const roomCount = plan?.rooms.length ?? 0;
  const placedCount = plan?.rooms.reduce((sum, room) => sum + room.participantUUIDs.length, 0) ?? 0;
  const summary = groupsFromFirst
    ? "Groups from Round 1"
    : roomCount === 0
      ? "No rooms yet"
      : `${roomCount} ${roomCount === 1 ? "room" : "rooms"} · ${placedCount} placed`;

  return (
    <Card className="bw-round-row" style={{ borderLeftColor: round.dot }}>
      <div className="bw-round-row__top">
        <EditableName value={round.title} placeholder={`Round ${position}`} onSave={onRename} />
        <div className="bw-stepper">
          <button
            type="button"
            aria-label="Shorter"
            disabled={round.durationSec <= MIN_DURATION_SEC}
            onClick={() => onDuration(round.durationSec - DURATION_STEP_SEC)}
          >
            −
          </button>
          <span className="bw-room-count bw-mono">{formatDuration(round.durationSec)}</span>
          <button type="button" aria-label="Longer" onClick={() => onDuration(round.durationSec + DURATION_STEP_SEC)}>
            +
          </button>
        </div>
      </div>
      <span className="bw-round-row__summary">{summary}</span>
      <div className="bw-round-row__actions">
        {groupsFromFirst ? null : (
          <Button variant="secondary" size="sm" onClick={() => onOpen("rooms")}>
            Rooms
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => onOpen("tasks")}>
          Tasks
        </Button>
        <div className="bw-header-spacer" />
        <Button
          variant="ghost"
          size="sm"
          className="bw-button--danger-text"
          disabled={round.status === "launched" || round.status === "closed"}
          title={
            round.status === "launched"
              ? "Close the round before removing it"
              : round.status === "closed"
                ? "A round that has run keeps its results"
                : undefined
          }
          onClick={onDelete}
        >
          Remove
        </Button>
      </div>
    </Card>
  );
}
