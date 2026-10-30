// Relative with the extension, so `npm test` (plain Node) can load the constants.
import { MAX_CHALLENGE_OPTIONS, MAX_QUIZ_QUESTIONS } from "../types/breakout.ts";
import type {
  ChallengeDraft,
  ChallengeQuestion,
  ChallengeResults,
  RoomChallengeAnswers,
  RoomChallengeResult,
} from "@/types/breakout";

/**
 * Pure helpers for live polls and quizzes: the host's draft edits and checks,
 * and the small reads both the host's results and the room's overlay need.
 */

export type ChallengeKind = ChallengeDraft["kind"];

/** Label and the time choices for each kind. The first time is the default. */
export const CHALLENGE_KINDS: Record<ChallengeKind, { label: string; durations: number[] }> = {
  poll: { label: "Poll", durations: [60, 30, 120] },
  quiz: { label: "Quiz", durations: [120, 60, 180, 300] },
};

/** Store limits, copied from backend/store/challenges.ts. */
export const MAX_TITLE_LENGTH = 100;
export const MAX_QUESTION_LENGTH = 300;
export const MAX_OPTION_LENGTH = 120;

const EMPTY_QUESTION: ChallengeQuestion = { text: "", options: ["", ""] };

export function emptyDraft(kind: ChallengeKind): ChallengeDraft {
  const fields = { title: "", questions: [EMPTY_QUESTION], durationSec: CHALLENGE_KINDS[kind].durations[0] };
  return kind === "poll" ? { kind, ...fields } : { kind, ...fields, answerKey: [0] };
}

/** "A", "B", ... for option positions. */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Replaces one question; the quiz's right answer stays on its option unless that option is gone. */
export function setQuestion(draft: ChallengeDraft, index: number, question: ChallengeQuestion): ChallengeDraft {
  const questions = draft.questions.map((current, position) => (position === index ? question : current));
  if (draft.kind === "poll") return { ...draft, questions };
  const answerKey = draft.answerKey.map((right, position) =>
    position === index ? Math.min(right, question.options.length - 1) : right,
  );
  return { ...draft, questions, answerKey };
}

/** Removes one option and moves the quiz's right answer with the options after it. */
export function removeOption(draft: ChallengeDraft, index: number, option: number): ChallengeDraft {
  const question = draft.questions[index];
  const options = question.options.filter((_, at) => at !== option);
  const questions = draft.questions.map((current, at) => (at === index ? { ...question, options } : current));
  if (draft.kind === "poll") return { ...draft, questions };
  const right = draft.answerKey[index];
  // Removing the right option leaves the first one marked; the host picks again.
  const moved = right === option ? 0 : right > option ? right - 1 : right;
  return { ...draft, questions, answerKey: draft.answerKey.map((key, at) => (at === index ? moved : key)) };
}

export function addQuestion(draft: ChallengeDraft): ChallengeDraft {
  if (draft.kind === "poll") return draft;
  return { ...draft, questions: [...draft.questions, EMPTY_QUESTION], answerKey: [...draft.answerKey, 0] };
}

export function removeQuestion(draft: ChallengeDraft, index: number): ChallengeDraft {
  if (draft.kind === "poll") return draft;
  return {
    ...draft,
    questions: draft.questions.filter((_, at) => at !== index),
    answerKey: draft.answerKey.filter((_, at) => at !== index),
  };
}

/** Why the draft cannot launch yet, or null when it can. */
export function draftProblem(draft: ChallengeDraft): string | null {
  if (draft.kind === "quiz" && !draft.title.trim()) return "Give the quiz a title.";
  if (draft.questions.length > (draft.kind === "poll" ? 1 : MAX_QUIZ_QUESTIONS)) return "Too many questions.";
  for (const [index, question] of draft.questions.entries()) {
    const label = draft.kind === "poll" ? "The question" : `Question ${index + 1}`;
    if (!question.text.trim()) return `${label} needs text.`;
    if (question.options.length < 2 || question.options.length > MAX_CHALLENGE_OPTIONS) {
      return `${label} needs 2 to ${MAX_CHALLENGE_OPTIONS} options.`;
    }
    if (question.options.some((option) => !option.trim())) return `${label} has an empty option.`;
  }
  return null;
}

/** The draft as sent: trimmed, and a poll titled by its question. */
export function launchableDraft(draft: ChallengeDraft): ChallengeDraft {
  const questions = draft.questions.map((question) => ({
    text: question.text.trim(),
    options: question.options.map((option) => option.trim()),
  }));
  const title = draft.kind === "poll" ? questions[0].text.slice(0, MAX_TITLE_LENGTH) : draft.title.trim();
  return { ...draft, title, questions };
}

/** The question the room is on: the first one not locked in, or -1 when all are. */
export function currentQuestion(answers: RoomChallengeAnswers): number {
  return answers.locks.findIndex((lock) => lock === null);
}

/** Rooms that locked in this option for this question, in results order. */
export function roomsChoosing(results: ChallengeResults, question: number, option: number): RoomChallengeResult[] {
  return results.rooms.filter((room) => room.answers[question] === option);
}

/**
 * The quiz winners: every room on the top score. Finish time never breaks a tie.
 * None when no room got anything right, so an empty quiz crowns nobody.
 */
export function quizWinners(results: ChallengeResults): RoomChallengeResult[] {
  const [first] = results.rooms;
  if (!results.answerKey || !first || first.correct === 0) return [];
  return results.rooms.filter((room) => room.correct === first.correct);
}

/** A room's place by score alone: rooms on the same score share it ("1st, 1st, 3rd"). */
export function placeOf(results: ChallengeResults, room: RoomChallengeResult): number {
  return 1 + results.rooms.filter((other) => other.correct > room.correct).length;
}

/** "1st", "2nd", "3rd", "4th"... */
export function placeLabel(place: number): string {
  const suffix = place % 100 >= 11 && place % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][place % 10] ?? "th");
  return `${place}${suffix}`;
}

/** "Room 1", "Room 1 and Room 2", "Room 1, Room 2 and Room 3". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The reveal's headline for one room: its win, a shared first place, or who won. */
export function winnerHeadline(results: ChallengeResults, ownRoomId: string): string {
  const winners = quizWinners(results);
  if (winners.length === 0) return "No winner this time";
  const ownWins = winners.some((room) => room.roomId === ownRoomId);
  if (winners.length === 1) return ownWins ? "Your room wins!" : `${winners[0].name} wins`;
  const others = winners.filter((room) => room.roomId !== ownRoomId).map((room) => room.name);
  return ownWins ? `Your room ties for first with ${listNames(others)}!` : `${listNames(others)} tie for first`;
}
