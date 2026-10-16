import type { WorkflowSnapshot } from "@/types/breakout";

/**
 * One demo session as data. The simulation engine never changes per scenario:
 * a new session is a new file of this shape.
 */
export interface Scenario {
  id: string;
  meetingTitle: string;
  /** The cached AI builder example: what the host "typed". */
  aiPrompt: string;
  /** What the AI builder returned for `aiPrompt`; the session runs on it. */
  workflow: WorkflowSnapshot;
  host: Person;
  /** The visitor's own tile. */
  visitor: Person;
  /** Dummy participants; ids are used by the round scripts. */
  people: Person[];
  /** Same order as `workflow.rounds`. A round without a script runs as free play only. */
  rounds: RoundScript[];
  /** The guided tour, in order. */
  tour: TourStep[];
}

/** Something the visitor does that moves the tour on by itself. */
export type TourEvent =
  | "hostAppOpened"
  | "proposal"
  | "used"
  | "launched"
  | "appAsked"
  | "participantAppOpened"
  | "visitorTurn"
  | "visitorAnswered"
  | "noteAsked"
  | "visitorPosted"
  | "roomOpened"
  | "ended";

export interface TourStep {
  title: string;
  body: string;
  /** The part of the screen the step is about; it gets a focus ring. */
  target: "host" | "participant" | "meeting";
  /** Whose screen the step shows; unset keeps the current one. */
  view?: "host" | "participant" | "both";
  /** Set: the step waits for this and moves on when it happens. Unset: a Next button. */
  until?: TourEvent;
  /** Buttons to point at, in order: the first one on screen blinks until clicked. */
  point?: TourPoint[];
  /** Set: start pointing only once this happened (the room asks first). */
  pointWhen?: TourEvent;
}

/** A button the tour can point at; the button carries it as `data-tour`. */
export type TourPoint =
  | "apps"
  | "generate"
  | "use-workflow"
  | "launch"
  | "answer"
  | "submit-answer"
  | "board"
  | "post-note"
  | "visitor-room"
  | "end-round";

export interface Person {
  id: string;
  name: string;
}

export interface RoundScript {
  /** Room name -> person ids. The room holding `visitor.id` is the one the visitor joins. */
  rooms: Record<string, string[]>;
  /** What happens in the visitor's room, in order, about 2–3 s per line. */
  talk: TalkLine[];
  /** What the host sees arrive from the rooms the visitor is not in. */
  otherRooms: RoomOutcome[];
  /** Prefilled, editable answers for the visitor; an empty submit uses them. */
  suggested: { individual: string; note: string };
}

/** A part of the participant's app the room is talking about. */
export type FocusTarget = "goal" | "steps" | "checklist" | "individual" | "board";

/** One beat of the room. Only "say" shows a speech bubble; the rest show up in the app. */
export type TalkLine =
  | { kind: "say"; by: string; text: string }
  /** Nobody talks for a moment: the silence when people first land in a room. */
  | { kind: "pause"; ms: number }
  /** Highlights the part of the app being talked about; null clears it. */
  | { kind: "focus"; target: FocusTarget | null }
  /** Ticks the round's checklist item at this index. */
  | { kind: "tick"; by: string; item: number }
  /** A note on the round's idea board. */
  | { kind: "note"; by: string; text: string }
  /** A submitted answer to the round's individual activity; only the host sees it. */
  | { kind: "answer"; by: string; text: string }
  /** The talk pauses until the visitor opens the app, submits their answer or posts a note; `prompt` is the dummy turning to them. */
  | { kind: "visitorTurn"; by: string; prompt: string; waitFor: VisitorTask };

/** What a room can wait for the visitor to do. */
export type VisitorTask = "openApp" | "answer" | "note";

export interface RoomOutcome {
  room: string;
  /** Checklist item indexes ticked by the end of the round. */
  ticks: number[];
  notes: { by: string; text: string }[];
  answers: { by: string; text: string }[];
}
