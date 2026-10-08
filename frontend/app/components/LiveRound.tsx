"use client";

import { useState } from "react";

import { adjustRoundTime } from "@/lib/execution-api";
import { initialsFrom } from "@/lib/participant-status";
import { assignParticipantToRoom, autoAssignParticipantsEvenly } from "@/lib/room-plan-assignments";
import { formatClock, useRemainingSec } from "@/lib/round-clock";
import type { LiveOperationState } from "@/lib/use-live-room-controller";
import { useRoomResults } from "@/lib/use-room-results";
import { useRoundTasks } from "@/lib/use-round-tasks";
import { roundLabel } from "@/lib/use-workspace";
import type { LiveParticipant, LiveState, RoundMeta, RoundPlan, RoundPlanDraft, Workspace } from "@/types/breakout";

import { toast } from "sonner";

import ActivityResultsPage from "./ActivityResultsPage";
import EditTaskModal from "./EditTaskModal";
import NotPlacedSheet from "./NotPlacedSheet";
import PageFrame, { type FrameTab } from "./PageFrame";
import RoomResultsPage from "./RoomResultsPage";
import SessionPage from "./SessionPage";
import { BrandMark, Button, Card, ConfirmModal, Pill, StatusDot } from "./ui";
import ZoomActionOverlay from "./ZoomActionOverlay";

/**
 * The running round. Room names and dots come from the round's draft; who is
 * where comes from Zoom webhooks via LiveState. The timer counts down to the
 * backend's endsAt, and the backend decides when the round is actually over.
 */
/** One press of the timer stepper. */
const ADJUST_STEP_SEC = 60;

type LivePage = "rooms" | "session";

/** Where the Rooms tab is: the grid, one room's work, or one activity's submissions. */
type RoomsLevel =
  | { kind: "grid" }
  | { kind: "room"; roomId: string }
  | { kind: "activity"; roomId: string; activityId: string };

const GRID: RoomsLevel = { kind: "grid" };

const LIVE_PAGES: FrameTab<LivePage>[] = [
  { id: "rooms", label: "Rooms" },
  { id: "session", label: "Session" },
];

export default function LiveRound({
  workspace,
  round,
  live,
  connected,
  operation,
  nextRound,
  onHome,
  onSkipRound,
  onEndRound,
  onLaunchNext,
  onPlace,
  plans,
  onAddRound,
  onUpdateRound,
  onDeleteRound,
}: {
  workspace: Workspace;
  round: RoundPlanDraft;
  live: LiveState;
  connected: boolean;
  operation: LiveOperationState;
  nextRound: RoundMeta | null;
  onHome: () => void;
  /** Mark a later round as one to skip, or put a skipped one back. */
  onSkipRound: (roundId: string, skipped: boolean) => Promise<void>;
  onEndRound: () => void;
  onLaunchNext: () => void;
  /** Saves the round with people added to rooms and moves them in Zoom. Reports its own errors. */
  onPlace: (next: RoundPlanDraft) => Promise<void>;
  /** Every round's saved plan, for the Session page's room summaries. */
  plans: Record<string, RoundPlan | null>;
  onAddRound: () => Promise<void>;
  onUpdateRound: (roundId: string, patch: Partial<Pick<RoundMeta, "title" | "durationSec">>) => Promise<void>;
  onDeleteRound: (roundId: string) => Promise<void>;
}) {
  const [editingTask, setEditingTask] = useState(false);
  const [page, setPage] = useState<LivePage>("rooms");
  const [placing, setPlacing] = useState<string | null>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  // Remembered per round: switching to Session and back keeps the level, a new round starts at the grid.
  const [rooms, setRooms] = useState<{ roundId: string; level: RoomsLevel }>({ roundId: round.roundId, level: GRID });
  // The shown round, not the live one: after a close its task and results stay readable until the next launch.
  const tasks = useRoundTasks(live.parentUUID, round.roundId);
  const busy = operation.kind === "running";

  // The backend re-arms the timer and pushes the new endsAt over SSE, so there
  // is nothing to set here: the countdown above follows the pushed state.
  async function adjustTime(seconds: number) {
    try {
      await adjustRoundTime(live.parentUUID, seconds);
    } catch (error) {
      toast.error(
        seconds > 0 ? "Could not add time." : "Could not take time off.",
        { description: error instanceof Error ? error.message : undefined },
      );
    }
  }

  const open = live.round !== null;
  const remainingSec = useRemainingSec(live.round?.endsAt ?? 0);
  const participants = live.participants;

  // Waiting: in the main room, not the host, and in no room or main-room choice of this round's plan.
  const planned = new Set([
    ...round.rooms.flatMap((room) => room.participantUUIDs),
    ...round.stayInMainParticipantUUIDs,
  ]);
  const waiting = participants.filter(
    (p) => p.location === "main" && !p.isHost && !planned.has(p.participantUUID),
  );

  async function place(key: string, next: RoundPlanDraft) {
    setPlacing(key);
    await onPlace(next);
    setPlacing(null);
  }

  const level = rooms.roundId === round.roundId ? rooms.level : GRID;
  const openRoom = level.kind === "grid" ? null : (round.rooms.find((room) => room.id === level.roomId) ?? null);
  const openActivity =
    level.kind === "activity" ? (tasks.activities.find((activity) => activity.id === level.activityId) ?? null) : null;
  const results = useRoomResults({
    parentUUID: live.parentUUID,
    roundId: round.roundId,
    roomId: openRoom?.id ?? "",
    roomRevision: openRoom ? (live.roomRevisions[openRoom.id] ?? 0) : 0,
  });
  const goTo = (next: RoomsLevel) => setRooms({ roundId: round.roundId, level: next });

  /** Everyone the plan puts in a room, named from the live store where it knows them. */
  function peopleIn(roomId: string) {
    const planned = round.rooms.find((room) => room.id === roomId)?.participantUUIDs ?? [];
    return planned.map((participantUUID) => ({
      participantUUID,
      name: participants.find((p) => p.participantUUID === participantUUID)?.name || "Participant",
    }));
  }

  function membersOf(roomId: string): LiveParticipant[] {
    const uuid = live.round?.roomUUIDs[roomId];
    return uuid ? participants.filter((p) => p.location === uuid) : [];
  }

  const actionButton = open ? (
    <Button variant="danger" size="sm" busy={busy} onClick={() => setConfirmingEnd(true)}>
      End round
    </Button>
  ) : nextRound ? (
    <Button size="sm" busy={busy} onClick={onLaunchNext}>
      Launch {roundLabel(workspace, nextRound.roundId)}
    </Button>
  ) : null;

  const header = (
    <>
      <BrandMark onHome={onHome} />
      <div className="bw-round-heading">
        <span className="bw-header-title">{round.title}</span>
        <div className="bw-live-badge">
          <StatusDot color={open ? "var(--bw-red)" : "var(--bw-muted-4)"} round pulse={open} />
          <span className={open ? "bw-live-badge__label" : "bw-live-badge__label bw-live-badge__label--off"}>
            {open ? "Live" : "Closed"}
          </span>
        </div>
      </div>
      <div className="bw-header-spacer" />

      {remainingSec !== null ? (
        <>
          <span className="bw-live-clock bw-mono" title="Time left in this round">
            {formatClock(remainingSec)}
          </span>
          <div className="bw-stepper">
            <button
              disabled={!open || remainingSec <= ADJUST_STEP_SEC}
              title="Take a minute off this round"
              onClick={() => void adjustTime(-ADJUST_STEP_SEC)}
            >
              -
            </button>
            <button
              disabled={!open}
              title="Give this round another minute"
              onClick={() => void adjustTime(ADJUST_STEP_SEC)}
            >
              +
            </button>
          </div>
        </>
      ) : null}

      {actionButton}
    </>
  );

  const sheet =
    page === "rooms" && !openRoom && open ? (
      <NotPlacedSheet
        people={waiting}
        rooms={round.rooms}
        placing={placing}
        onPlace={(participantUUID, roomId) =>
          void place(participantUUID, assignParticipantToRoom(round, { participantUUID, roomId }))
        }
        onPlaceEvenly={() =>
          void place("all", autoAssignParticipantsEvenly(round, waiting.map((p) => p.participantUUID)))
        }
      />
    ) : null;

  return (
    <>
      <PageFrame
        bar={header}
        tabs={LIVE_PAGES}
        activeTab={page}
        onTabChange={setPage}
        tabsLabel="Live round views"
        sheet={sheet}
      >
        {page === "rooms" && openRoom && openActivity ? (
          <ActivityResultsPage
            activity={openActivity}
            roomName={openRoom.name}
            people={peopleIn(openRoom.id)}
            results={results}
            onBack={() => goTo({ kind: "room", roomId: openRoom.id })}
          />
        ) : page === "rooms" && openRoom ? (
          <RoomResultsPage
            room={openRoom}
            people={peopleIn(openRoom.id)}
            presentCount={membersOf(openRoom.id).length}
            checklist={tasks.task.checklist}
            activities={tasks.activities}
            results={results}
            onBack={() => goTo(GRID)}
            onOpenActivity={(activityId) => goTo({ kind: "activity", roomId: openRoom.id, activityId })}
          />
        ) : page === "rooms" ? (
          <div className="bw-room-grid">
            {round.rooms.map((room) => (
              <LiveRoomCard
                key={room.id}
                name={room.name}
                dot={room.dot}
                members={membersOf(room.id)}
                plannedCount={room.participantUUIDs.length}
                open={open}
                onOpen={() => goTo({ kind: "room", roomId: room.id })}
              />
            ))}
          </div>
        ) : (
          <SessionPage
            workspace={workspace}
            plans={plans}
            tasks={tasks}
            open={open}
            onEditTask={() => setEditingTask(true)}
            onAddRound={onAddRound}
            onUpdateRound={onUpdateRound}
            onDeleteRound={onDeleteRound}
            onSkipRound={onSkipRound}
          />
        )}
      </PageFrame>

      {confirmingEnd ? (
        <ConfirmModal
          title={`End ${round.title} now?`}
          message={`${remainingSec === null ? "" : `${formatClock(remainingSec)} left. `}Everyone returns to the main room.`}
          confirmLabel="End round"
          onConfirm={async () => onEndRound()}
          onClose={() => setConfirmingEnd(false)}
        />
      ) : null}

      <ZoomActionOverlay operation={operation} />

      {editingTask ? (
        <EditTaskModal roundTitle={round.title} tasks={tasks} onClose={() => setEditingTask(false)} />
      ) : null}
    </>
  );
}

/** One room as the host sees it live: who has entered so far, as initials. Opens the room's work. */
function LiveRoomCard({
  name,
  dot,
  members,
  plannedCount,
  open,
  onOpen,
}: {
  name: string;
  dot: string;
  members: LiveParticipant[];
  plannedCount: number;
  open: boolean;
  /** Opens this room's work: checklist and activities. */
  onOpen: () => void;
}) {
  return (
    <Card
      className="bw-room-card bw-room-card--clickable"
      role="button"
      tabIndex={0}
      aria-label={`Open ${name}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
    >
      <div className="bw-room-card__header">
        <StatusDot color={dot} />
        <span className="bw-room-name bw-live-room-name" title={name}>{name}</span>
        <div style={{ flex: 1 }} />
        <Pill tone="outline">{members.length} / {plannedCount}</Pill>
      </div>
      {members.length > 0 ? (
        <div className="bw-initials-list">
          {members.map((member) => (
            <span
              key={member.participantUUID}
              className="bw-initials"
              title={member.name}
              aria-label={member.name}
              role="img"
            >
              {initialsFrom(member.name)}
            </span>
          ))}
        </div>
      ) : (
        <span className="bw-live-room-empty">{open ? "Nobody here yet" : "Round closed"}</span>
      )}
    </Card>
  );
}
