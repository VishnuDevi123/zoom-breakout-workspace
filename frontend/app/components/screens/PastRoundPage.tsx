"use client";

import { useEffect, useState } from "react";

import { memberStatus } from "@/lib/activity-kinds";
import { readPastRound, type EarlierRound, type PastRound } from "@/lib/use-past-rounds";
import type { Activity, LiveState, RoomResponsesView } from "@/types/breakout";

import ActivityPrompt from "../ActivityPrompt";
import PageFrame from "../PageFrame";
import RoomPeople from "../RoomPeople";
import TaskDetails from "../TaskDetails";
import { BrandMark, Card, SectionLabel, Spinner } from "../ui";

/** Shortest time the opening spinner shows, as on the other participant pages. */
const OPEN_MIN_LOADING_MS = 300;

type PageState = { kind: "loading" } | { kind: "failed"; message: string } | { kind: "ready"; round: PastRound };

/**
 * One round that is over, kept minimal: its task, then for each activity the
 * participant's own submitted answer or the board's ideas as "Name: idea", and
 * who was in the room. Read once on open; nothing here can be changed.
 */
export default function PastRoundPage({
  parentUUID,
  participantUUID,
  round,
  live,
  onBack,
}: {
  parentUUID: string;
  participantUUID: string;
  round: EarlierRound;
  live: LiveState | null;
  onBack: () => void;
}) {
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    const pause = new Promise((resolve) => setTimeout(resolve, OPEN_MIN_LOADING_MS));
    Promise.all([readPastRound(parentUUID, round.roundId, participantUUID), pause])
      .then(([pastRound]) => {
        if (alive) setState({ kind: "ready", round: pastRound });
      })
      .catch((error: unknown) => {
        if (alive) setState({ kind: "failed", message: error instanceof Error ? error.message : "Could not load this round." });
      });
    return () => {
      alive = false;
    };
  }, [parentUUID, participantUUID, round.roundId]);

  const roomName = state.kind === "ready" && state.round.kind === "placed" ? state.round.room.name : null;

  return (
    <PageFrame
      tone="participant"
      contentKey={state.kind}
      bar={
        <>
          <BrandMark onHome={onBack} />
          <span className="bw-header-title">{roomName ? `${round.label} - ${roomName}` : round.label}</span>
        </>
      }
    >
      <PastRoundBody state={state} round={round} live={live} participantUUID={participantUUID} onBack={onBack} />
    </PageFrame>
  );
}

function PastRoundBody({
  state,
  round,
  live,
  participantUUID,
  onBack,
}: {
  state: PageState;
  round: EarlierRound;
  live: LiveState | null;
  participantUUID: string;
  onBack: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <div className="bw-setup-pending" role="status">
        <Spinner large />
        <span>Opening {round.label}…</span>
      </div>
    );
  }

  const back = (
    <button type="button" className="bw-results__back" onClick={onBack}>
      ← Back
    </button>
  );

  if (state.kind === "failed") {
    return (
      <div className="bw-session__column">
        {back}
        <Card tone="dashed" className="bw-activities-empty">
          {state.message}
        </Card>
      </div>
    );
  }

  if (state.round.kind === "notPlaced") {
    return (
      <div className="bw-session__column">
        {back}
        <Card tone="dashed" className="bw-activities-empty">
          You stayed in the main room this round.
        </Card>
      </div>
    );
  }

  const { room, task, activities, view } = state.round;
  // Names from the live store while those people are still in the meeting.
  const people = room.participantUUIDs.map((uuid) => {
    const name = uuid === participantUUID ? "You" : live?.participants.find((p) => p.participantUUID === uuid)?.name || "Participant";
    const status = activities.length > 0 ? memberStatus(activities, view, uuid) : null;
    return { participantUUID: uuid, name, status, done: status === "Submitted" };
  });

  return (
    <>
      {back}
      <div className="bw-room-layout">
        <section className="bw-session__column">
          <TaskDetails heading="Task" task={task} emptyText="This round had no task." />
          <SectionLabel>Activities</SectionLabel>
          {activities.length === 0 ? (
            <Card tone="dashed" className="bw-activities-empty">
              This round had no activities.
            </Card>
          ) : null}
          {activities.map((activity) => (
            <PastActivity key={activity.id} activity={activity} view={view} participantUUID={participantUUID} />
          ))}
        </section>

        <div className="bw-session__column">
          <RoomPeople heading="In this room" people={people} />
        </div>
      </div>
    </>
  );
}

/** One activity as it ended: the question, then the participant's submitted answer or the board's ideas. */
function PastActivity({
  activity,
  view,
  participantUUID,
}: {
  activity: Activity;
  view: RoomResponsesView;
  participantUUID: string;
}) {
  return (
    <Card className="bw-room-activity">
      <ActivityPrompt activity={activity} />
      {activity.kind === "individual" ? (
        <OwnAnswer answer={view.myAnswers[activity.id]} />
      ) : (
        <IdeaList notes={view.ideas[activity.id] ?? []} participantUUID={participantUUID} />
      )}
    </Card>
  );
}

/** Only a submitted answer counts; a draft left at the end of the round does not. */
function OwnAnswer({ answer }: { answer: RoomResponsesView["myAnswers"][string] | undefined }) {
  if (answer?.status !== "submitted") return <span className="bw-results__meta">You did not submit an answer.</span>;
  return <p className="bw-results__answer-text">{answer.text}</p>;
}

/** Every idea on the board as one line, "Name: idea", oldest first. */
function IdeaList({ notes, participantUUID }: { notes: RoomResponsesView["ideas"][string]; participantUUID: string }) {
  if (notes.length === 0) return <span className="bw-results__meta">No ideas were added.</span>;

  return (
    <ul className="bw-idea-list">
      {notes.map((note) => (
        <li key={note.id}>
          <span className="bw-idea-list__name">{note.participantUUID === participantUUID ? "You" : note.authorName}:</span>{" "}
          {note.description || note.title}
        </li>
      ))}
    </ul>
  );
}
