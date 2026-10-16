"use client";

import { useEffect, useRef, useState } from "react";

import type { FocusTarget, Scenario } from "@/data/scenarios/types";
import type { Activity } from "@/types/breakout";

import { nameOf, visitorRoom, type DemoState } from "../demo-state";

/**
 * The visitor's Breakout Workspace: waiting before launch, then their room's
 * task, shared checklist and activities. A simplified copy of the app's room page.
 */
export default function ParticipantApp({
  scenario,
  state,
  onTick,
  onAnswer,
  onNote,
}: {
  scenario: Scenario;
  state: DemoState;
  onTick: (item: number) => void;
  onAnswer: (text: string) => void;
  onNote: (text: string) => void;
}) {
  const [openActivity, setOpenActivity] = useState<Activity | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // The visitor's turn points at the activity they're asked for; otherwise whatever the room is reading.
  const yourTurn: FocusTarget | null = state.waitingFor === "answer" ? "individual" : state.waitingFor === "note" ? "board" : null;
  const focus = yourTurn ?? state.focus;

  // Bring what the room is talking about into view, once per change.
  useEffect(() => {
    if (focus) root.current?.querySelector(`[data-focus="${focus}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focus]);

  /** Marks one part of the app as the room's current topic. */
  function focusProps(target: FocusTarget) {
    const classes = [focus === target ? "dm-focus" : "", yourTurn === target ? "dm-focus--your-turn" : ""].filter(Boolean);
    return { "data-focus": target, className: classes.join(" ") };
  }
  const round = scenario.workflow.rounds[state.roundIndex];
  const suggested = scenario.rounds[state.roundIndex]?.suggested;
  const you = scenario.visitor.id;

  if (state.phase !== "live") {
    const lastRound = state.roundIndex === scenario.workflow.rounds.length - 1;
    const message = {
      planning: [`Waiting for ${scenario.host.name} to start the round.`, "Your room, task and activities appear here when it starts."],
      launching: [`Moving you to ${visitorRoom(scenario, state.roundIndex)}…`, "Zoom opens the breakout room; the app follows you in."],
      ended: [
        "The round ended. You're back in the main meeting.",
        lastRound ? "That was the last round." : `Waiting for ${scenario.host.name} to start the next round.`,
      ],
    }[state.phase];
    return (
      <div className="dm-app dm-app--waiting">
        <span className="bw-section-label">Round {state.roundIndex + 1}</span>
        <p className="dm-app__goal">{message[0]}</p>
        <p className="dm-app__meta">{message[1]}</p>
      </div>
    );
  }

  const myAnswer = state.answers.find((answer) => answer.by === you);

  if (openActivity?.kind === "ideaBoard") {
    return (
      <IdeaBoard
        activity={openActivity}
        notes={state.notes}
        suggestion={suggested?.note ?? ""}
        scenario={scenario}
        onPost={onNote}
        onBack={() => setOpenActivity(null)}
      />
    );
  }

  return (
    <div className="dm-app" ref={root}>
      <span className="bw-section-label">
        Round {state.roundIndex + 1} · {visitorRoom(scenario, state.roundIndex)}
      </span>
      <h2 className="dm-app__title">
        {round.title ?? `Round ${state.roundIndex + 1}`}
      </h2>

      {round.task ? (
        <>
          <div {...focusProps("goal")}>
            <div className="bw-card">
              <span className="bw-section-label">Goal</span>
              <p className="dm-app__goal">{round.task.goal}</p>
            </div>
          </div>
          <div {...focusProps("steps")}>
            <ol className="dm-steps">
              {round.task.instructions.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
          <div {...focusProps("checklist")}>
            <div className="bw-checklist">
              <span className="bw-checklist__title">Shared checklist</span>
              {round.task.checklist.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`bw-checklist__row${state.ticks[index] ? " bw-checklist__row--done" : ""}`}
                  aria-pressed={Boolean(state.ticks[index])}
                  onClick={() => onTick(index)}
                >
                  <span className="bw-checklist__box" aria-hidden="true" />
                  <span className="bw-checklist__label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <span className="bw-section-label">Activities</span>
      {round.activities.map((activity) => (
        <div
          key={activity.id}
          {...focusProps(
            activity.kind === "individual" ? "individual" : "board",
          )}
        >
          <button
            type="button"
            className="dm-activity"
            data-tour={activity.kind === "individual" ? "answer" : "board"}
            onClick={() => setOpenActivity(activity)}
          >
            <span className="dm-app__meta">
              {activity.kind === "individual" ? "Your answer" : "Idea board"}
            </span>
            <span className="dm-activity__title">{activity.title}</span>
            <span className="dm-app__meta">
              {activity.kind === "individual"
                ? myAnswer
                  ? "Submitted"
                  : "Not started"
                : `${state.notes.length} notes`}
            </span>
          </button>
        </div>
      ))}

      {openActivity?.kind === "individual" ? (
        <AnswerModal
          activity={openActivity}
          initial={myAnswer?.text ?? suggested?.individual ?? ""}
          suggestion={suggested?.individual ?? ""}
          onSubmit={(text) => {
            onAnswer(text);
            setOpenActivity(null);
          }}
          onClose={() => setOpenActivity(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Individual answer: a modal over the participant's app panel only (not the
 * meeting), so it never sits behind the tour card. Empty submits the suggestion.
 */
function AnswerModal({
  activity,
  initial,
  suggestion,
  onSubmit,
  onClose,
}: {
  activity: Activity;
  initial: string;
  suggestion: string;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);

  return (
    <div className="dm-panel-modal" role="dialog" aria-modal="true" aria-label={activity.title}>
      <div className="bw-overlay__panel dm-panel-modal__card">
        <div className="bw-overlay__header">
          <span className="bw-pill bw-pill--accent">Your answer</span>
          <div className="bw-header-spacer" />
          <button type="button" className="dm-app__back" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="bw-overlay__body">
          <h3 className="dm-app__title">{activity.title}</h3>
          <p className="dm-app__meta">{activity.description}</p>
          <textarea className="dm-input" rows={4} aria-label="Your answer" value={text} onChange={(event) => setText(event.target.value)} />
          <p className="dm-app__meta">Only the host sees your answer once you submit it.</p>
        </div>
        <div className="bw-overlay__footer">
          <button
            type="button"
            className="bw-button bw-button--primary bw-button--md"
            data-tour="submit-answer"
            onClick={() => onSubmit(text.trim() || suggestion)}
          >
            Submit to host
          </button>
        </div>
      </div>
    </div>
  );
}

/** The room's shared board: everyone's notes, and a box to post one. */
function IdeaBoard({
  activity,
  notes,
  suggestion,
  scenario,
  onPost,
  onBack,
}: {
  activity: Activity;
  notes: { by: string; text: string }[];
  suggestion: string;
  scenario: Scenario;
  onPost: (text: string) => void;
  onBack: () => void;
}) {
  const [text, setText] = useState(suggestion);
  const posted = notes.some((note) => note.by === scenario.visitor.id);

  return (
    <div className="dm-app">
      <button type="button" className="dm-app__back" onClick={onBack}>
        ← All activities
      </button>
      <h2 className="dm-app__title">{activity.title}</h2>
      <p className="dm-app__meta">{activity.description}</p>
      <div className="dm-notes">
        {notes.length === 0 ? <p className="dm-app__meta">No notes yet. Be the first.</p> : null}
        {notes.map((note, index) => (
          <div key={index} className="dm-note">
            <span>{note.text}</span>
            <span className="dm-note__by">{nameOf(scenario, note.by)}</span>
          </div>
        ))}
      </div>
      <form
        className="dm-note-form"
        onSubmit={(event) => {
          event.preventDefault();
          // The suggestion fills in only for a first, empty post.
          const note = text.trim() || (posted ? "" : suggestion);
          if (!note) return;
          onPost(note);
          setText("");
        }}
      >
        <input
          className="dm-input"
          value={text}
          placeholder="Add a note"
          aria-label="New note"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="bw-button bw-button--primary bw-button--md" data-tour="post-note">
          {posted ? "Post another" : "Post"}
        </button>
      </form>
    </div>
  );
}
