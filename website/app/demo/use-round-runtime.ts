"use client";

import { useEffect, useReducer, useState } from "react";

import type { Scenario, TalkLine } from "@/data/scenarios/types";

import { demoReducer, initialDemoState } from "./demo-state";

/** A whole round plays in this long; the app's clock shows the real minutes, sped up. */
export const ROUND_MS = 180_000;
/** The cached AI answer arrives after this, so Generate feels like a real call. */
const GENERATE_MS = 2500;
/** How long tiles take to leave the main meeting; matches `dmTileLeave` in demo.css. */
const LEAVE_MS = 700;
/** An app action (tick, note, answer) stays in view this long before the room goes on. */
const ACTION_MS = 1800;
const FOCUS_MS = 700;

/** Time to read a spoken line: a base plus per character, within limits. */
function readingMs(text: string): number {
  return Math.min(7000, Math.max(3200, 1800 + text.length * 50));
}

/** How long the room stays on a line before the next one plays. */
function holdAfter(line: TalkLine | undefined): number {
  if (!line) return FOCUS_MS;
  if (line.kind === "say") return readingMs(line.text);
  // The visitor already read the prompt while answering; the room picks up soon after.
  if (line.kind === "visitorTurn") return ACTION_MS;
  if (line.kind === "pause") return line.ms;
  if (line.kind === "focus") return FOCUS_MS;
  return ACTION_MS;
}

/**
 * Runs one round of the simulation: the leave animation, the compressed clock,
 * and the visitor's room talk, line by line, pausing on the visitor's turn.
 */
export function useRoundRuntime(scenario: Scenario, appsOpen: boolean) {
  // Without the tour both apps start open; the tour has the visitor open them from Apps.
  const [state, dispatch] = useReducer(demoReducer, appsOpen, (open) => ({
    ...initialDemoState,
    apps: { host: open, participant: open },
  }));
  const [now, setNow] = useState(0);
  const talk = scenario.rounds[state.roundIndex]?.talk ?? [];
  const nextLine = talk[state.talkIndex];
  const previousLine = talk[state.talkIndex - 1];

  useEffect(() => {
    if (state.ai !== "generating") return;
    const timer = setTimeout(() => dispatch({ kind: "generated" }), GENERATE_MS);
    return () => clearTimeout(timer);
  }, [state.ai]);

  useEffect(() => {
    if (state.phase !== "launching") return;
    const timer = setTimeout(() => dispatch({ kind: "launched", at: Date.now() }), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [state.phase]);

  // The clock ticks while live; at zero the round closes, as the app does when its timer ends,
  // but never while the room is waiting for the visitor.
  useEffect(() => {
    if (state.phase !== "live") return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current - state.startedAt >= ROUND_MS && !state.waitingFor) dispatch({ kind: "end", rest: talk.slice(state.talkIndex) });
    }, 500);
    return () => clearInterval(timer);
  }, [state.phase, state.startedAt, state.talkIndex, state.waitingFor, talk]);

  useEffect(() => {
    if (state.phase !== "live" || state.waitingFor || !nextLine) return;
    // The wait belongs to the line before: a long sentence stays up longer.
    const timer = setTimeout(() => dispatch({ kind: "advance", line: nextLine }), holdAfter(previousLine));
    return () => clearTimeout(timer);
  }, [state.phase, state.waitingFor, nextLine, previousLine]);

  const elapsed = state.phase === "live" ? Math.max(0, now - state.startedAt) : 0;
  /** 0 at launch, 1 when the round is over; the other rooms' results arrive along it. */
  const progress = state.phase === "ended" ? 1 : Math.min(1, elapsed / ROUND_MS);

  return {
    state,
    dispatch,
    progress,
    launch: (roundIndex: number) => dispatch({ kind: "launch", roundIndex }),
    end: () => dispatch({ kind: "end", rest: talk.slice(state.talkIndex) }),
    /** Plays everything up to the visitor's turn (or to the end) at once. */
    skip: () => {
      const turn = talk.findIndex((line, index) => index >= state.talkIndex && line.kind === "visitorTurn");
      dispatch({ kind: "skip", lines: talk.slice(state.talkIndex, turn === -1 ? talk.length : turn + 1) });
    },
    canSkip: state.phase === "live" && !state.waitingFor && Boolean(nextLine),
  };
}
