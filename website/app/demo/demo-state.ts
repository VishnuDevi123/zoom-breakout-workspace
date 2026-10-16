import type { FocusTarget, Scenario, TalkLine, VisitorTask } from "@/data/scenarios/types";

/** One note or answer, with who wrote it. */
export interface Entry {
  by: string;
  text: string;
}

/**
 * Everything the panels and the gallery read. Only the visitor's room changes
 * as the demo runs; the other rooms' results come from the scenario script.
 */
export interface DemoState {
  /** Breakout Workspace panels opened from Zoom's Apps button, per person. */
  apps: { host: boolean; participant: boolean };
  /** The room whose results the host has open; null shows all rooms. */
  hostRoom: string | null;
  /** The host's AI builder, before there is a workflow: prompt, waiting, proposal, accepted. */
  ai: "prompt" | "generating" | "proposal" | "used";
  /** "launching": tiles are leaving the main meeting; "ended": the round closed, everyone is back. */
  phase: "planning" | "launching" | "live" | "ended";
  roundIndex: number;
  /** When the round went live (ms); the compressed clock counts from here. */
  startedAt: number;
  /** Next line of the visitor's room talk to play. */
  talkIndex: number;
  /** The line being spoken now: a bright bubble and the speaker ring. */
  speech: Entry | null;
  /** Each person's last line this round, kept faded on their tile so the thread is easy to follow. */
  lastSaid: Record<string, string>;
  /** The talk paused on a "visitorTurn" until the visitor does this; null while it runs. */
  waitingFor: VisitorTask | null;
  /** The part of the participant's app the room is talking about. */
  focus: FocusTarget | null;
  /** What the visitor has done this round, so a turn they already took is not waited for. */
  visitorDid: { answer: boolean; note: boolean };
  /** Checklist item index -> person id who ticked it. */
  ticks: Record<number, string>;
  /** The visitor's room's idea board, oldest first. */
  notes: Entry[];
  /** Submitted answers to the individual activity in the visitor's room. */
  answers: Entry[];
}

export type DemoAction =
  /** The tour's Next and Back set the whole state at once. */
  | { kind: "replace"; state: DemoState }
  | { kind: "openApp"; role: "host" | "participant"; open: boolean }
  | { kind: "openRoom"; room: string | null }
  | { kind: "generate" }
  | { kind: "generated" }
  | { kind: "useWorkflow" }
  | { kind: "launch"; roundIndex: number }
  | { kind: "launched"; at: number }
  | { kind: "end"; rest: TalkLine[] }
  | { kind: "advance"; line: TalkLine }
  | { kind: "skip"; lines: TalkLine[] }
  | { kind: "tick"; by: string; item: number }
  | { kind: "note"; by: string; text: string; visitor: boolean }
  | { kind: "answer"; by: string; text: string; visitor: boolean };

export const initialDemoState: DemoState = {
  apps: { host: false, participant: false },
  hostRoom: null,
  ai: "prompt",
  phase: "planning",
  roundIndex: 0,
  startedAt: 0,
  talkIndex: 0,
  speech: null,
  lastSaid: {},
  waitingFor: null,
  focus: null,
  visitorDid: { answer: false, note: false },
  ticks: {},
  notes: [],
  answers: [],
};

/** One person's answer replaces their earlier one. */
function withAnswer(answers: Entry[], answer: Entry): Entry[] {
  return [...answers.filter((existing) => existing.by !== answer.by), answer];
}

/** Plays one talk line: speech becomes a bubble, the rest changes the room's app state. */
function play(state: DemoState, line: TalkLine): DemoState {
  const next = { ...state, talkIndex: state.talkIndex + 1 };
  switch (line.kind) {
    case "say":
      return { ...next, speech: { by: line.by, text: line.text }, lastSaid: { ...state.lastSaid, [line.by]: line.text } };
    case "pause":
      return { ...next, speech: null };
    case "focus":
      return { ...next, focus: line.target };
    case "tick":
      return { ...next, ticks: { ...state.ticks, [line.item]: line.by } };
    case "note":
      return { ...next, notes: [...state.notes, { by: line.by, text: line.text }] };
    case "answer":
      return { ...next, answers: withAnswer(state.answers, { by: line.by, text: line.text }) };
    case "visitorTurn":
      // Visitors run ahead of the room: if they already did it, the room moves on.
      if (line.waitFor === "openApp" ? state.apps.participant : state.visitorDid[line.waitFor]) return next;
      return {
        ...next,
        speech: { by: line.by, text: line.prompt },
        lastSaid: { ...state.lastSaid, [line.by]: line.prompt },
        waitingFor: line.waitFor,
      };
  }
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.kind) {
    case "replace":
      return action.state;
    case "openApp":
      return {
        ...state,
        apps: { ...state.apps, [action.role]: action.open },
        waitingFor: action.role === "participant" && action.open && state.waitingFor === "openApp" ? null : state.waitingFor,
      };
    case "openRoom":
      return { ...state, hostRoom: action.room };
    case "generate":
      return { ...state, ai: "generating" };
    case "generated":
      return { ...state, ai: "proposal" };
    case "useWorkflow":
      return { ...state, ai: "used" };
    case "launch":
      // Apps stay open across rounds, as a Zoom App does when people move between rooms.
      return { ...initialDemoState, apps: state.apps, ai: "used", phase: "launching", roundIndex: action.roundIndex };
    case "launched":
      return { ...state, phase: "live", startedAt: action.at };
    case "end": {
      // Ending early fast-forwards the room, so its results are never empty; the visitor's turn is skipped.
      const played = action.rest.filter((line) => line.kind !== "visitorTurn").reduce(play, state);
      // The host lands back on all rooms, where Launch next is.
      return { ...played, phase: "ended", speech: null, waitingFor: null, focus: null, hostRoom: null };
    }
    case "advance":
      return play(state, action.line);
    case "skip":
      return action.lines.reduce(play, state);
    case "tick": {
      // Ticking a ticked item unticks it, like the app's shared checklist.
      const { [action.item]: current, ...rest } = state.ticks;
      return { ...state, ticks: current ? rest : { ...rest, [action.item]: action.by } };
    }
    case "note":
      return {
        ...state,
        notes: [...state.notes, { by: action.by, text: action.text }],
        visitorDid: action.visitor ? { ...state.visitorDid, note: true } : state.visitorDid,
        waitingFor: action.visitor && state.waitingFor === "note" ? null : state.waitingFor,
      };
    case "answer":
      return {
        ...state,
        answers: withAnswer(state.answers, { by: action.by, text: action.text }),
        visitorDid: action.visitor ? { ...state.visitorDid, answer: true } : state.visitorDid,
        // The visitor's answer is what the room was waiting for.
        waitingFor: action.visitor && state.waitingFor === "answer" ? null : state.waitingFor,
      };
  }
}

/**
 * Room name -> person ids for a round. Scripted rounds list their rooms; a round
 * without a script deals everyone into the rooms afresh, like "New groups each round".
 */
export function roomsFor(scenario: Scenario, roundIndex: number): Record<string, string[]> {
  const scripted = scenario.rounds[roundIndex]?.rooms;
  if (scripted) return scripted;
  const names = scenario.workflow.rounds[roundIndex].roomNames;
  const rooms: Record<string, string[]> = Object.fromEntries(names.map((name) => [name, []]));
  rooms[names[(roundIndex + 1) % names.length]].push(scenario.visitor.id);
  scenario.people.forEach((person, index) => rooms[names[(index + roundIndex) % names.length]].push(person.id));
  return rooms;
}

/** The room name holding the visitor in this round. */
export function visitorRoom(scenario: Scenario, roundIndex: number): string {
  const rooms = roomsFor(scenario, roundIndex);
  return Object.keys(rooms).find((room) => rooms[room].includes(scenario.visitor.id)) ?? "Room 1";
}

/** Display name for a person id; the script refers to people by id. */
export function nameOf(scenario: Scenario, id: string): string {
  const everyone = [scenario.host, scenario.visitor, ...scenario.people];
  return everyone.find((person) => person.id === id)?.name ?? id;
}
