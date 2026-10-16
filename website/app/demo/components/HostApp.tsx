"use client";

import { useEffect, useState } from "react";

import type { RoomOutcome, Scenario } from "@/data/scenarios/types";

import { formatClock } from "../clock";
import { nameOf, roomsFor, visitorRoom, type DemoState } from "../demo-state";

/** The prompt types in TYPE_STEP characters every TYPE_MS. */
const TYPE_STEP = 4;
const TYPE_MS = 30;

function minutes(durationSec: number): string {
  return `${Math.round(durationSec / 60)} min`;
}

/** The workflow page's three grouping choices, as the app labels them. */
function groupingLabel({ sameRoomsEveryRound, samePeopleEveryRound }: Scenario["workflow"]): string {
  if (!sameRoomsEveryRound) return "Set up each round";
  return samePeopleEveryRound ? "Same groups every round" : "New groups each round";
}

/** The first `share` of a scripted list: the other rooms' results arrive as the round runs. */
function arrived<T>(items: T[], share: number): T[] {
  return items.slice(0, Math.ceil(items.length * share));
}

/**
 * The host's Breakout Workspace: the planned workflow and Launch, then the live
 * rooms with each room's results, End round and Launch next. A simplified copy of the app's screens.
 */
export default function HostApp({
  scenario,
  state,
  progress,
  remainingSec,
  onLaunch,
  onEnd,
  onGenerate,
  onUseWorkflow,
  onOpenRoom,
}: {
  scenario: Scenario;
  state: DemoState;
  /** 0 to 1 through the round. */
  progress: number;
  remainingSec: number;
  onLaunch: (roundIndex: number) => void;
  onEnd: () => void;
  onGenerate: () => void;
  onUseWorkflow: () => void;
  onOpenRoom: (room: string | null) => void;
}) {
  const round = scenario.workflow.rounds[state.roundIndex];
  const title = round.title ?? `Round ${state.roundIndex + 1}`;

  if (state.ai !== "used") {
    return <AiBuilder scenario={scenario} stage={state.ai} onGenerate={onGenerate} onUse={onUseWorkflow} />;
  }

  if (state.phase === "planning") {
    return (
      <div className="dm-app">
        <span className="bw-section-label">Your workflow</span>
        <h2 className="dm-app__title">{scenario.workflow.title}</h2>
        <ol className="dm-rounds">
          {scenario.workflow.rounds.map((planned, index) => (
            <li key={index} className={index === state.roundIndex ? "dm-rounds__row dm-rounds__row--next" : "dm-rounds__row"}>
              <span>
                {index + 1}. {planned.title ?? `Round ${index + 1}`}
              </span>
              <span className="dm-app__meta">{minutes(planned.durationSec)}</span>
            </li>
          ))}
        </ol>
        <div className="bw-card">
          <span className="bw-section-label">Round {state.roundIndex + 1} task</span>
          <p className="dm-app__goal">{round.task?.goal}</p>
          <span className="dm-app__meta">
            {round.roomNames.length} rooms · {round.activities.length} activities · {round.task?.checklist.length ?? 0} checklist items
          </span>
        </div>
        <button
          type="button"
          className="bw-button bw-button--primary bw-button--lg"
          data-tour="launch"
          onClick={() => onLaunch(state.roundIndex)}
        >
          Launch Round {state.roundIndex + 1}
        </button>
      </div>
    );
  }

  const nextIndex = state.roundIndex + 1;
  const hasNext = nextIndex < scenario.workflow.rounds.length;
  const footer =
    state.phase === "ended" ? (
      hasNext ? (
        <button type="button" className="bw-button bw-button--primary bw-button--lg" onClick={() => onLaunch(nextIndex)}>
          Launch Round {nextIndex + 1}
        </button>
      ) : (
        <p className="dm-app__meta">All {scenario.workflow.rounds.length} rounds are done.</p>
      )
    ) : (
      <button type="button" className="bw-button bw-button--secondary bw-button--lg" data-tour="end-round" onClick={onEnd}>
        End round · {formatClock(remainingSec)} left
      </button>
    );

  return <LiveRooms scenario={scenario} state={state} title={title} progress={progress} footer={footer} onOpenRoom={onOpenRoom} />;
}

/** Room cards for the running round; opening one shows what that room produced. */
function LiveRooms({
  scenario,
  state,
  title,
  progress,
  footer,
  onOpenRoom,
}: {
  scenario: Scenario;
  state: DemoState;
  title: string;
  progress: number;
  footer: React.ReactNode;
  onOpenRoom: (room: string | null) => void;
}) {
  const openRoom = state.hostRoom;
  const script = scenario.rounds[state.roundIndex];
  const round = scenario.workflow.rounds[state.roundIndex];
  const checklist = round.task?.checklist ?? [];
  const myRoom = visitorRoom(scenario, state.roundIndex);

  // The visitor's room is live demo state; the other rooms come from the script.
  const outcomes: RoomOutcome[] = round.roomNames.map((room) =>
    room === myRoom
      ? { room, ticks: Object.keys(state.ticks).map(Number), notes: state.notes, answers: state.answers }
      : scriptedOutcome(script?.otherRooms.find((outcome) => outcome.room === room), room, progress),
  );
  const rooms = roomsFor(scenario, state.roundIndex);
  const opened = outcomes.find((outcome) => outcome.room === openRoom);

  if (opened) {
    const individual = round.activities.find((activity) => activity.kind === "individual");
    const board = round.activities.find((activity) => activity.kind === "ideaBoard");
    return (
      <div className="dm-app">
        <button type="button" className="dm-app__back" onClick={() => onOpenRoom(null)}>
          ← All rooms
        </button>
        <h2 className="dm-app__title">{opened.room}</h2>
        <div className="bw-checklist">
          <span className="bw-checklist__title">Checklist</span>
          {checklist.map((item, index) => (
            <span key={item.id} className={`bw-checklist__row${opened.ticks.includes(index) ? " bw-checklist__row--done" : ""}`}>
              <span className="bw-checklist__box" aria-hidden="true" />
              <span className="bw-checklist__label">{item.label}</span>
            </span>
          ))}
        </div>
        <ResultList heading={individual?.title ?? "Answers"} empty="No answers submitted yet." entries={opened.answers} scenario={scenario} />
        <ResultList heading={board?.title ?? "Idea board"} empty="No notes yet." entries={opened.notes} scenario={scenario} />
        {footer}
      </div>
    );
  }

  return (
    <div className="dm-app">
      {state.phase === "ended" ? (
        <span className="bw-section-label">Round {state.roundIndex + 1} ended · everyone is back</span>
      ) : (
        <span className="dm-live">
          <span className="dm-live__dot" aria-hidden="true" /> Live · Round {state.roundIndex + 1}
        </span>
      )}
      <h2 className="dm-app__title">{title}</h2>
      <div className="dm-room-grid">
        {outcomes.map((outcome) => (
          <button
            key={outcome.room}
            type="button"
            className="dm-room-card"
            data-tour={outcome.room === myRoom ? "visitor-room" : undefined}
            onClick={() => onOpenRoom(outcome.room)}
          >
            <span className="dm-room-card__name">
              {outcome.room}
              {outcome.room === myRoom ? <span className="bw-pill bw-pill--accent">{scenario.visitor.name.split(" ")[0]}</span> : null}
            </span>
            <span className="dm-app__meta">
              {rooms[outcome.room]?.length ?? 0} people · {outcome.ticks.length}/{checklist.length} ticked
            </span>
            <span className="dm-app__meta">
              {outcome.answers.length} answers · {outcome.notes.length} notes
            </span>
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}

function scriptedOutcome(outcome: RoomOutcome | undefined, room: string, progress: number): RoomOutcome {
  if (!outcome) return { room, ticks: [], notes: [], answers: [] };
  return {
    room,
    ticks: arrived(outcome.ticks, progress),
    notes: arrived(outcome.notes, progress),
    answers: arrived(outcome.answers, progress),
  };
}

function ResultList({ heading, empty, entries, scenario }: { heading: string; empty: string; entries: { by: string; text: string }[]; scenario: Scenario }) {
  return (
    <section className="dm-results">
      <h3 className="dm-results__heading">{heading}</h3>
      {entries.length === 0 ? <p className="dm-app__meta">{empty}</p> : null}
      {entries.map((entry, index) => (
        <p key={index} className="dm-results__entry">
          <span className="dm-results__by">{nameOf(scenario, entry.by)}</span>
          {entry.text}
        </p>
      ))}
    </section>
  );
}

/**
 * The app's AI builder with the scenario's prompt already typed. The answer is
 * cached: the demo never calls the AI, so it costs nothing and is the same every time.
 */
function AiBuilder({
  scenario,
  stage,
  onGenerate,
  onUse,
}: {
  scenario: Scenario;
  stage: "prompt" | "generating" | "proposal";
  onGenerate: () => void;
  onUse: () => void;
}) {
  const { workflow } = scenario;
  const totalSec = workflow.rounds.reduce((sum, round) => sum + round.durationSec, 0);
  const [typed, setTyped] = useState(stage === "prompt" ? 0 : scenario.aiPrompt.length);
  // Next can move past the prompt mid-typing; from then on the whole prompt shows.
  const typing = stage === "prompt" && typed < scenario.aiPrompt.length;
  const shown = typing ? typed : scenario.aiPrompt.length;

  // The guide types the host's request, a few characters at a time (about 3 s).
  useEffect(() => {
    if (!typing) return;
    const timer = setInterval(() => setTyped((count) => count + TYPE_STEP), TYPE_MS);
    return () => clearInterval(timer);
  }, [typing]);

  return (
    <div className="dm-app">
      <h2 className="dm-app__title">What&apos;s your session today?</h2>
      <p className="dm-app__meta">Describe it and AI builds the rounds, rooms, tasks and activities.</p>
      <div className="bw-ai-prompt dm-ai-prompt">
        <p className="dm-ai-prompt__text">
          {scenario.aiPrompt.slice(0, shown)}
          {typing ? <span className="dm-ai-prompt__caret" aria-hidden="true" /> : null}
        </p>
        {stage === "prompt" && typing ? (
          <button type="button" className="dm-app__back" onClick={() => setTyped(scenario.aiPrompt.length)}>
            Skip typing
          </button>
        ) : null}
        {stage === "prompt" && !typing ? (
          <button type="button" className="bw-button bw-button--primary bw-button--md" data-tour="generate" onClick={onGenerate}>
            Generate
          </button>
        ) : null}
        {stage === "generating" ? (
          <div className="bw-ai-progress" role="status">
            <div className="bw-ai-progress__track">
              <div className="bw-ai-progress__bar" />
            </div>
            <div className="bw-ai-progress__row">Setting up rounds and rooms…</div>
          </div>
        ) : null}
      </div>
      {stage === "proposal" ? (
        <div className="bw-ai-proposal">
          <span className="bw-ai-proposal__lead">Here&apos;s your workflow:</span>
          <span className="bw-ai-proposal__title">{workflow.title}</span>
          <span className="bw-ai-proposal__meta">
            {workflow.rounds.length} rounds · {Math.round(totalSec / 60)} min · {groupingLabel(workflow)}
          </span>
          <ol className="bw-ai-proposal__rounds">
            {workflow.rounds.map((round, index) => (
              <li key={index} className="bw-ai-proposal__round">
                <span>
                  {index + 1}. {round.title ?? `Round ${index + 1}`}
                </span>
                <span>{minutes(round.durationSec)}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="bw-button bw-button--primary bw-button--md" data-tour="use-workflow" onClick={onUse}>
            Use this workflow
          </button>
        </div>
      ) : null}
    </div>
  );
}
