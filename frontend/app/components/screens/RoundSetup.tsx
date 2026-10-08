"use client";

import { initialsFrom, type Participant } from "@/lib/participant-status";
import { useDismissibleMenus } from "@/lib/use-dismissible-menus";
import type { useRoomPlan } from "@/lib/use-room-plan";
import type { useRoundTasks } from "@/lib/use-round-tasks";
import type { RoundPlanDraft } from "@/types/breakout";

import ActivityList from "../ActivityList";
import NotPlacedSheet from "../NotPlacedSheet";
import PageFrame, { type FrameTab } from "../PageFrame";
import RoomCard from "../RoomCard";
import TaskFields from "../TaskFields";
import { Button, Card, EditableName, Pill, SectionLabel, Spinner } from "../ui";

export type SetupTab = "rooms" | "tasks";

const SETUP_TABS: FrameTab<SetupTab>[] = [
  { id: "rooms", label: "Rooms" },
  { id: "tasks", label: "Tasks" },
];

type RoomPlan = ReturnType<typeof useRoomPlan>;
type ReadyDraft = Extract<RoomPlan["state"], { kind: "ready" }>;

/**
 * Setting up one round, in the same frame as the live round: Rooms (cards and
 * the people still to place) and Tasks (the task and its activities). Nothing
 * here touches Zoom. Leaving the round, by ← or Next, saves both tabs first.
 */
export default function RoundSetup({
  title,
  placeholder,
  tab,
  plan,
  draft,
  tasks,
  roster,
  rosterKnown,
  nextLabel,
  roomsLocked,
  onTabChange,
  onRename,
  onBack,
  onNext,
}: {
  title: string | null;
  /** "Round N" by position, shown when the round has no name of its own. */
  placeholder: string;
  tab: SetupTab;
  plan: RoomPlan;
  draft: ReadyDraft;
  tasks: ReturnType<typeof useRoundTasks>;
  roster: Participant[];
  rosterKnown: boolean;
  /** "Next round ›", or "Done" on the last round. */
  nextLabel: string;
  /** "Same groups", Round 2 and later: rooms come from the previous round at launch. */
  roomsLocked: boolean;
  onTabChange: (tab: SetupTab) => void;
  onRename: (title: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const menuRootRef = useDismissibleMenus();
  const round = draft.draft;
  const tabs = roomsLocked
    ? SETUP_TABS.map((option) =>
        option.id === "rooms" ? { ...option, disabled: true, hint: "Uses the previous round's groups" } : option,
      )
    : SETUP_TABS;

  /** Both tabs keep edits locally for a moment; nothing may be lost on the way out. */
  async function leave(go: () => void) {
    if (!(await plan.flushSave())) return;
    if (tasks.state !== "loading" && !(await tasks.save(tasks.task))) return;
    go();
  }

  const bar = (
    <>
      <button type="button" className="bw-back" aria-label="Back to the workflow" onClick={() => void leave(onBack)}>
        ←
      </button>
      <div className="bw-round-heading">
        <EditableName value={title} placeholder={placeholder} className="bw-setup-title" onSave={onRename} />
      </div>
      <div className="bw-header-spacer" />
      {tab === "rooms" ? <RoomControls plan={plan} round={round} roster={roster} rosterKnown={rosterKnown} /> : null}
      <Button size="sm" onClick={() => void leave(onNext)}>
        {nextLabel}
      </Button>
    </>
  );

  return (
    <PageFrame
      tone="planning"
      bar={bar}
      tabs={tabs}
      activeTab={tab}
      onTabChange={onTabChange}
      tabsLabel="Round setup"
      contentKey={tab}
      sheet={tab === "rooms" ? <PlanningSheet plan={plan} round={round} roster={roster} /> : null}
    >
      {tab === "rooms" ? (
        <div ref={menuRootRef}>
          <SaveProblem save={draft.save} onRetry={plan.retrySave} onReload={plan.reloadDraft} />
          <RoomGrid plan={plan} round={round} roster={roster} rosterKnown={rosterKnown} />
        </div>
      ) : (
        <div className="bw-session">
          <section className="bw-session__column">
            <TaskFields task={tasks.task} setTask={tasks.setTask} save={(next) => void tasks.save(next)} />
          </section>
          <section className="bw-session__column">
            <ActivityList activities={tasks.activities} live={false} onSave={tasks.saveActivities} />
          </section>
        </div>
      )}
    </PageFrame>
  );
}

/**
 * The same frame while a round's draft loads or after it failed, so moving
 * between rounds never swaps to a different screen.
 */
export function RoundSetupPending({
  heading,
  tab,
  message,
  failed,
  onRetry,
  onBack,
  onTabChange,
}: {
  heading: string;
  tab: SetupTab;
  message: string;
  failed: boolean;
  onRetry: () => void;
  onBack: () => void;
  onTabChange: (tab: SetupTab) => void;
}) {
  const bar = (
    <>
      <button type="button" className="bw-back" aria-label="Back to the workflow" onClick={onBack}>
        ←
      </button>
      <span className="bw-header-title">{heading}</span>
    </>
  );

  return (
    <PageFrame tone="planning" bar={bar} tabs={SETUP_TABS} activeTab={tab} onTabChange={onTabChange} tabsLabel="Round setup">
      <div className="bw-setup-pending" role="status">
        {failed ? (
          <>
            <SectionLabel>Draft load failed</SectionLabel>
            <span className="bw-results__meta">{message}</span>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry load
            </Button>
          </>
        ) : (
          <>
            <Spinner large />
            <span className="bw-results__meta">{message}</span>
          </>
        )}
      </div>
    </PageFrame>
  );
}

/** Everyone Zoom still reports, minus the host, who is never placed. */
function placeable(roster: Participant[]): Participant[] {
  return roster.filter((person) => person.assignmentEligible && !person.isHost);
}

function RoomControls({
  plan,
  round,
  roster,
  rosterKnown,
}: {
  plan: RoomPlan;
  round: RoundPlanDraft;
  roster: Participant[];
  rosterKnown: boolean;
}) {
  const lastRoom = round.rooms.at(-1);
  const people = placeable(roster);

  return (
    <>
      <div className="bw-stepper">
        <button
          type="button"
          aria-label={lastRoom ? `Remove ${lastRoom.name}` : "Remove room"}
          disabled={round.rooms.length <= 1}
          onClick={() => lastRoom && removeRoom(plan, lastRoom.id, round)}
        >
          −
        </button>
        <span className="bw-room-count">
          {round.rooms.length} {round.rooms.length === 1 ? "room" : "rooms"}
        </span>
        <button type="button" aria-label="Add room" disabled={!plan.canAdd} onClick={plan.addRoom}>
          +
        </button>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={!rosterKnown || people.length === 0}
        title={!rosterKnown ? "Waiting for the live roster." : people.length === 0 ? "Nobody to place yet." : undefined}
        onClick={() => plan.autoAssignParticipants(people.map((person) => person.participantUUID))}
      >
        Auto-assign evenly
      </Button>
    </>
  );
}

/** Removing a room with people in it asks first; they go back to "Not yet placed". */
function removeRoom(plan: RoomPlan, roomId: string, round: RoundPlanDraft) {
  const room = round.rooms.find((candidate) => candidate.id === roomId);
  if (!room || round.rooms.length <= 1) return;
  const count = room.participantUUIDs.length;
  if (count > 0 && !window.confirm(`Remove ${room.name}? ${count} planned ${count === 1 ? "person" : "people"} will become unplaced.`)) {
    return;
  }
  plan.removeRoom(room.id);
}

function RoomGrid({
  plan,
  round,
  roster,
  rosterKnown,
}: {
  plan: RoomPlan;
  round: RoundPlanDraft;
  roster: Participant[];
  rosterKnown: boolean;
}) {
  const byId = new Map(roster.map((person) => [person.participantUUID, person]));
  const currentRosterIds = new Set(byId.keys());
  const placed = new Set([...round.rooms.flatMap((room) => room.participantUUIDs), ...round.stayInMainParticipantUUIDs]);
  const unplaced = rosterKnown ? placeable(roster).filter((person) => !placed.has(person.participantUUID)) : [];

  return (
    <div className="bw-room-grid">
      {round.rooms.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          participants={room.participantUUIDs.map((uuid) => byId.get(uuid) ?? unavailable(uuid))}
          rooms={round.rooms}
          unassignedParticipants={unplaced}
          currentRosterIds={currentRosterIds}
          rosterKnown={rosterKnown}
          canRemove={round.rooms.length > 1}
          onRename={(name) => plan.renameRoom(room.id, name)}
          onRemove={() => removeRoom(plan, room.id, round)}
          onAssignParticipant={plan.assignParticipant}
          onUnassignParticipant={plan.unassignParticipant}
          onKeepParticipantInMain={plan.keepParticipantInMain}
        />
      ))}
    </div>
  );
}

/** The live sheet, but placing only edits this round's plan. */
function PlanningSheet({ plan, round, roster }: { plan: RoomPlan; round: RoundPlanDraft; roster: Participant[] }) {
  const byId = new Map(roster.map((person) => [person.participantUUID, person]));
  const placed = new Set([...round.rooms.flatMap((room) => room.participantUUIDs), ...round.stayInMainParticipantUUIDs]);
  const waiting = placeable(roster).filter((person) => !placed.has(person.participantUUID));
  const asSheetPerson = (person: Participant) => ({ participantUUID: person.participantUUID, name: person.displayName });

  return (
    <NotPlacedSheet
      people={waiting.map(asSheetPerson)}
      rooms={round.rooms}
      placing={null}
      onPlace={(participantUUID, roomId) => plan.assignParticipant({ participantUUID, roomId })}
      onPlaceEvenly={() => plan.autoAssignParticipants(placeable(roster).map((person) => person.participantUUID))}
      stayingInMain={round.stayInMainParticipantUUIDs.map((uuid) => asSheetPerson(byId.get(uuid) ?? unavailable(uuid)))}
      onKeepInMain={plan.keepParticipantInMain}
      onReturn={plan.unassignParticipant}
    />
  );
}

function SaveProblem({
  save,
  onRetry,
  onReload,
}: {
  save: ReadyDraft["save"];
  onRetry: () => void;
  onReload: () => void;
}) {
  if (save.kind !== "error") return null;
  return (
    <Card className="bw-save-problem">
      <div className="bw-save-problem__head">
        <SectionLabel>Save failed</SectionLabel>
        <Pill tone="red">{save.conflict ? "Conflict" : "Not saved"}</Pill>
      </div>
      <span className="bw-results__meta">
        {save.message} {save.conflict ? "Retry keeps your local draft." : ""}
      </span>
      <div className="bw-round-row__actions">
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry save
        </Button>
        {save.conflict ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm("Discard local draft edits and reload the saved version?")) onReload();
            }}
          >
            Reload saved draft
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** Someone the plan places who is not in the meeting right now. */
function unavailable(participantUUID: string): Participant {
  return {
    participantUUID,
    assignmentEligible: true,
    displayName: "Unavailable participant",
    initials: initialsFrom("?"),
    status: "left",
    roomId: null,
    isHost: false,
  };
}
