"use client";

import { useState } from "react";

import { adjustRoundTime } from "@/lib/execution-api";
import { initialsFrom } from "@/lib/participant-status";
import { assignParticipantToRoom, autoAssignParticipantsEvenly } from "@/lib/room-plan-assignments";
import { formatClock, useRemainingSec } from "@/lib/round-clock";
import type { LiveOperationState } from "@/lib/use-live-room-controller";
import { useRoundTasks } from "@/lib/use-round-tasks";
import { roundLabel } from "@/lib/use-workspace";
import type { LiveParticipant, LiveState, RoundMeta, RoundPlanDraft, Workspace } from "@/types/breakout";

import { toast } from "sonner";

import ActivityList from "./ActivityList";
import EditTaskModal from "./EditTaskModal";
import NotPlacedSheet from "./NotPlacedSheet";
import SkipRoundsModal from "./SkipRoundsModal";
import { BrandMark, Button, Card, Pill, SectionLabel, StatusDot } from "./ui";

/**
 * The running round. Room names and dots come from the round's draft; who is
 * where comes from Zoom webhooks via LiveState. The timer counts down to the
 * backend's endsAt, and the backend decides when the round is actually over.
 */
/** One press of the timer stepper. */
const ADJUST_STEP_SEC = 60;

type LivePage = "rooms" | "session";

const LIVE_PAGES: { page: LivePage; label: string }[] = [
  { page: "rooms", label: "Rooms" },
  { page: "session", label: "Session" },
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
}) {
  const [editingTask, setEditingTask] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [page, setPage] = useState<LivePage>("rooms");
  const [placing, setPlacing] = useState<string | null>(null);
  const tasks = useRoundTasks(live.parentUUID, live.round?.roundId ?? "");
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

  function membersOf(roomId: string): LiveParticipant[] {
    const uuid = live.round?.roomUUIDs[roomId];
    return uuid ? participants.filter((p) => p.location === uuid) : [];
  }

  const actionButton = open ? (
    <Button variant="danger" size="sm" busy={busy} onClick={onEndRound}>
      End round
    </Button>
  ) : nextRound ? (
    <Button size="sm" busy={busy} onClick={onLaunchNext}>
      Launch {roundLabel(workspace, nextRound.roundId)}
    </Button>
  ) : null;

  return (
    <div className="bw-live">
      <header className="bw-live-bar">
        <BrandMark onHome={onHome} />
        <div className="bw-round-heading">
          <span className="bw-header-title">{round.title}</span>
          <div className="bw-live-badge">
            <StatusDot color={open ? "var(--bw-red)" : "var(--bw-muted-4)"} round pulse={open} />
            <span
              className={
                open ? "bw-live-badge__label" : "bw-live-badge__label bw-live-badge__label--off"
              }
            >
              {open ? "Live" : "Closed"}
            </span>
          </div>
        </div>
        <div className="bw-header-spacer" />

        {remainingSec !== null ? (
          <>
            <span className="bw-live-bar__clock bw-mono" title="Time left in this round">
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
      </header>

      <div className="bw-live-main">
        <main className="bw-live-page">
          <div className="bw-live-page__content">
            {page === "rooms" ? (
              <div className="bw-room-grid">
                {round.rooms.map((room) => (
                  <LiveRoomCard
                    key={room.id}
                    name={room.name}
                    dot={room.dot}
                    members={membersOf(room.id)}
                    plannedCount={room.participantUUIDs.length}
                    open={open}
                  />
                ))}
              </div>
            ) : (
              // Placeholder: the current rail, kept reachable until the Session page is rebuilt.
              <div className="bw-live-session">
                <SectionLabel>Session plan</SectionLabel>
                {workspace.rounds.map((meta, index) => (
                  <Card
                    key={meta.roundId}
                    tone={meta.roundId === live.round?.roundId ? "default" : "sunken"}
                    className="bw-plan-row"
                  >
                    <span
                      className="bw-member-name"
                      style={meta.status === "skipped" ? { color: "var(--bw-muted-4)" } : undefined}
                    >
                      R{index + 1}: {roundLabel(workspace, meta.roundId)}
                    </span>
                    <span className="bw-mono" style={{ fontSize: "var(--bw-fs-meta)" }}>
                      {meta.status === "closed"
                        ? "✓"
                        : meta.status === "skipped"
                          ? "skipped"
                          : formatClock(meta.durationSec)}
                    </span>
                  </Card>
                ))}
                <Button variant="secondary" size="sm" onClick={() => setSkipping(true)}>
                  Skip rounds
                </Button>

                <SectionLabel>Task this round</SectionLabel>
                <button className="bw-task-summary" disabled={!open} onClick={() => setEditingTask(true)}>
                  <span className="bw-task-summary__goal">
                    {tasks.task.goal || "No task set for this round"}
                  </span>
                  <span className="bw-task-summary__action">
                    {tasks.task.goal ? "Edit task" : "Add a task"}
                  </span>
                </button>

                {open ? (
                  <ActivityList activities={tasks.activities} live onSave={tasks.saveActivities} />
                ) : null}
              </div>
            )}
          </div>
        </main>

        {page === "rooms" && open ? (
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
        ) : null}
      </div>

      <nav className="bw-live-nav" aria-label="Live round views">
        {LIVE_PAGES.map((option) => (
          <button
            key={option.page}
            type="button"
            className="bw-live-nav__item"
            aria-current={page === option.page ? "page" : undefined}
            onClick={() => setPage(option.page)}
          >
            {option.label}
          </button>
        ))}
      </nav>

      {skipping ? (
        <SkipRoundsModal
          workspace={workspace}
          liveRoundId={live.round?.roundId ?? null}
          onSkipRound={onSkipRound}
          onClose={() => setSkipping(false)}
        />
      ) : null}

      {editingTask ? (
        <EditTaskModal
          roundTitle={round.title}
          tasks={tasks}
          onClose={() => setEditingTask(false)}
        />
      ) : null}
    </div>
  );
}

/** One room as the host sees it live: who has entered so far, as initials. */
function LiveRoomCard({
  name,
  dot,
  members,
  plannedCount,
  open,
}: {
  name: string;
  dot: string;
  members: LiveParticipant[];
  plannedCount: number;
  open: boolean;
}) {
  return (
    <Card className="bw-room-card">
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
