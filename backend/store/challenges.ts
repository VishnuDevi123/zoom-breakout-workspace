import {
  MAX_CHALLENGE_OPTIONS,
  MAX_QUIZ_QUESTIONS,
  type ChallengeDraft,
  type ChallengeQuestion,
  type ChallengeResults,
  type ChallengeView,
  type RoomChallengeAnswers,
  type RoomChallengeResult,
} from "../types/breakout.ts";
import { assertInRoom, requiredString, ResponseError, type RoomRef } from "./activity_responses.ts";
import { bumpChallengeRevision, bumpRoomRevision, getLive } from "./live.ts";
import { getRoundPlan } from "./round-plans.ts";

// Live polls and quizzes. The host launches one while a round runs; every room
// answers it as one. One list per (parentUUID, roundId), oldest first.
//
// Launch and reveal bump LiveState.challengeRevision, so every client refetches.
// A pick or a lock is room work and bumps only that room's counter.

interface StoredChallenge {
  id: string;
  draft: ChallengeDraft;
  launchedAt: number;
  endsAt: number;
  revealed: boolean;
  /** roomId -> that room's picks and locks. Rooms that have not touched it are missing. */
  rooms: Record<string, RoomChallengeAnswers>;
  /** Reveals it when time is up. Undefined rather than null so clearTimeout() needs no guard. */
  timer?: ReturnType<typeof setTimeout>;
}

const challenges = new Map<string, StoredChallenge[]>();

const MAX_TITLE_LENGTH = 100;
const MAX_QUESTION_LENGTH = 300;
const MAX_OPTION_LENGTH = 120;
const MIN_DURATION_SEC = 15;
const MAX_DURATION_SEC = 900;

function key(parentUUID: string, roundId: string): string {
  return `${parentUUID}:${roundId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, field: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0 || text.length > max) {
    throw new ResponseError(`${field} must be 1 to ${max} characters.`, 400);
  }
  return text;
}

function wholeNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ResponseError(`${field} must be a whole number from ${min} to ${max}.`, 400);
  }
  return value;
}

function parseQuestion(value: unknown, position: number): ChallengeQuestion {
  const field = `Question ${position + 1}`;
  if (!isRecord(value) || !Array.isArray(value.options)) throw new ResponseError(`${field} needs text and options.`, 400);
  if (value.options.length < 2 || value.options.length > MAX_CHALLENGE_OPTIONS) {
    throw new ResponseError(`${field} needs 2 to ${MAX_CHALLENGE_OPTIONS} options.`, 400);
  }
  return {
    text: boundedText(value.text, field, MAX_QUESTION_LENGTH),
    options: value.options.map((option, index) => boundedText(option, `${field}, option ${index + 1}`, MAX_OPTION_LENGTH)),
  };
}

/** The host's draft, checked and trimmed. A poll has one question; a quiz has a right answer for each. */
function parseDraft(value: unknown): ChallengeDraft {
  if (!isRecord(value) || !Array.isArray(value.questions)) throw new ResponseError("draft must be an object with questions.", 400);
  if (value.kind !== "poll" && value.kind !== "quiz") throw new ResponseError('kind must be "poll" or "quiz".', 400);
  const maxQuestions = value.kind === "poll" ? 1 : MAX_QUIZ_QUESTIONS;
  if (value.questions.length < 1 || value.questions.length > maxQuestions) {
    throw new ResponseError(`A ${value.kind} holds 1 to ${maxQuestions} questions.`, 400);
  }
  const questions = value.questions.map(parseQuestion);
  const fields = {
    title: boundedText(value.title, "title", MAX_TITLE_LENGTH),
    questions,
    durationSec: wholeNumber(value.durationSec, "durationSec", MIN_DURATION_SEC, MAX_DURATION_SEC),
  };
  if (value.kind === "poll") return { kind: "poll", ...fields };

  const answerKey = value.answerKey;
  if (!Array.isArray(answerKey) || answerKey.length !== questions.length) {
    throw new ResponseError("answerKey needs one right option per question.", 400);
  }
  return {
    kind: "quiz",
    ...fields,
    answerKey: answerKey.map((option, index) =>
      wholeNumber(option, `Right answer for question ${index + 1}`, 0, questions[index].options.length - 1),
    ),
  };
}

function emptyAnswers(questionCount: number): RoomChallengeAnswers {
  return {
    picks: Array.from({ length: questionCount }, () => ({})),
    locks: Array.from({ length: questionCount }, () => null),
  };
}

/** Every planned room's locked answers and score. A quiz ranks most right first, then the earliest finish. */
function resultsFor(parentUUID: string, roundId: string, challenge: StoredChallenge): ChallengeResults {
  const { draft } = challenge;
  const answerKey = draft.kind === "quiz" ? draft.answerKey : null;
  const rooms: RoomChallengeResult[] = (getRoundPlan(parentUUID, roundId)?.rooms ?? []).map((room) => {
    const locks = challenge.rooms[room.id]?.locks ?? emptyAnswers(draft.questions.length).locks;
    const answers = locks.map((lock) => lock?.option ?? null);
    const finished = locks.every((lock) => lock !== null);
    return {
      roomId: room.id,
      name: room.name,
      dot: room.dot,
      answers,
      correct: answerKey ? answers.filter((option, index) => option === answerKey[index]).length : 0,
      finishedAt: finished ? Math.max(...locks.map((lock) => lock?.at ?? 0)) : null,
    };
  });
  if (answerKey) {
    rooms.sort((a, b) => b.correct - a.correct || (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity));
  }
  return { answerKey, rooms };
}

function viewOf(
  challenge: StoredChallenge,
  extra: Pick<ChallengeView, "room" | "results">,
): ChallengeView {
  return {
    id: challenge.id,
    kind: challenge.draft.kind,
    title: challenge.draft.title,
    questions: structuredClone(challenge.draft.questions),
    launchedAt: challenge.launchedAt,
    endsAt: challenge.endsAt,
    revealed: challenge.revealed,
    ...extra,
  };
}

/** The host's view: every challenge this round, oldest first, each with live results. */
export function getChallengesForHost(parentUUID: unknown, roundId: string): ChallengeView[] {
  const meeting = requiredString(parentUUID, "parentUUID");
  return (challenges.get(key(meeting, roundId)) ?? []).map((challenge) =>
    viewOf(challenge, { room: null, results: resultsFor(meeting, roundId, challenge) }),
  );
}

/** The latest challenge as one room member sees it: their room's work, and every room's results once revealed. */
export function getRoomChallenge(room: RoomRef, participantUUID: unknown): ChallengeView | null {
  assertInRoom(room, requiredString(participantUUID, "participantUUID"));
  const latest = challenges.get(key(room.parentUUID, room.roundId))?.at(-1);
  if (!latest) return null;
  return viewOf(latest, {
    room: structuredClone(latest.rooms[room.roomId] ?? emptyAnswers(latest.draft.questions.length)),
    results: latest.revealed ? resultsFor(room.parentUUID, room.roundId, latest) : null,
  });
}

/** Only the running round takes a new one, and only after the last one was revealed. */
export function launchChallenge(parentUUID: unknown, roundId: string, draftInput: unknown): ChallengeView[] {
  const meeting = requiredString(parentUUID, "parentUUID");
  const draft = parseDraft(draftInput);
  if (getLive(meeting).round?.roundId !== roundId) throw new ResponseError("This round is not running.", 409);
  const list = challenges.get(key(meeting, roundId)) ?? [];
  if (list.some((challenge) => !challenge.revealed)) {
    throw new ResponseError("Reveal the running poll or quiz before launching another.", 409);
  }

  const launchedAt = Date.now();
  const challenge: StoredChallenge = {
    id: crypto.randomUUID(),
    draft,
    launchedAt,
    endsAt: launchedAt + draft.durationSec * 1000,
    revealed: false,
    rooms: {},
  };
  // The results reach every room by themselves when time is up; the host may reveal earlier.
  challenge.timer = setTimeout(() => markRevealed(meeting, challenge), draft.durationSec * 1000);
  list.push(challenge);
  challenges.set(key(meeting, roundId), list);
  bumpChallengeRevision(meeting);
  return getChallengesForHost(meeting, roundId);
}

/** Shows the answers and every room's results to all rooms, and ends it: no lock is taken after a reveal. */
function markRevealed(parentUUID: string, challenge: StoredChallenge): void {
  clearTimeout(challenge.timer);
  if (challenge.revealed) return;
  challenge.revealed = true;
  bumpChallengeRevision(parentUUID);
}

/** The host reveals before time is up. Time running out reveals it anyway. */
export function revealChallenge(parentUUID: unknown, roundId: string, challengeId: string): ChallengeView[] {
  const meeting = requiredString(parentUUID, "parentUUID");
  const challenge = challenges.get(key(meeting, roundId))?.find((candidate) => candidate.id === challengeId);
  if (!challenge) throw new ResponseError("No such poll or quiz in this round.", 404);
  markRevealed(meeting, challenge);
  return getChallengesForHost(meeting, roundId);
}

/** The room's answers to an open question, after the caller and the timing are checked. */
function openQuestion(room: RoomRef, challengeId: string, questionInput: string, request: unknown) {
  if (!isRecord(request)) throw new ResponseError("The request body must be an object.", 400);
  const participantUUID = requiredString(request.participantUUID, "participantUUID");
  assertInRoom(room, participantUUID);

  const challenge = challenges.get(key(room.parentUUID, room.roundId))?.find((candidate) => candidate.id === challengeId);
  if (!challenge) throw new ResponseError("No such poll or quiz in this round.", 404);
  if (getLive(room.parentUUID).round?.roundId !== room.roundId) throw new ResponseError("This round is not running.", 409);
  if (challenge.revealed || Date.now() > challenge.endsAt) throw new ResponseError("Time is up for this one.", 409);

  const questionCount = challenge.draft.questions.length;
  const index = wholeNumber(Number(questionInput), "question", 0, questionCount - 1);
  const option = wholeNumber(request.option, "option", 0, challenge.draft.questions[index].options.length - 1);
  const answers = (challenge.rooms[room.roomId] ??= emptyAnswers(questionCount));
  if (answers.locks[index]) throw new ResponseError("Your room already locked this one in.", 409);
  return { answers, index, option, participantUUID };
}

/** One person's suggestion; the room sees it, nothing is final. */
export function pickOption(room: RoomRef, challengeId: string, question: string, request: unknown): ChallengeView | null {
  const { answers, index, option, participantUUID } = openQuestion(room, challengeId, question, request);
  answers.picks[index][participantUUID] = option;
  bumpRoomRevision(room.parentUUID, room.roomId);
  return getRoomChallenge(room, participantUUID);
}

/** The room's final answer to one question. Anyone in the room may lock it; the first lock wins. */
export function lockAnswer(room: RoomRef, challengeId: string, question: string, request: unknown): ChallengeView | null {
  const { answers, index, option, participantUUID } = openQuestion(room, challengeId, question, request);
  answers.locks[index] = { option, participantUUID, at: Date.now() };
  bumpRoomRevision(room.parentUUID, room.roomId);
  return getRoomChallenge(room, participantUUID);
}

/** Called by deleteRound in store/workspace.ts, with the round's plan, task and responses. */
export function deleteRoundChallenges(parentUUID: string, roundId: string): void {
  for (const challenge of challenges.get(key(parentUUID, roundId)) ?? []) clearTimeout(challenge.timer);
  challenges.delete(key(parentUUID, roundId));
}
