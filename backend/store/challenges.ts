import {
  MAX_CHALLENGE_OPTIONS,
  MAX_QUIZ_QUESTIONS,
  type ChallengeDraft,
  type ChallengeQuestion,
  type ChallengeResults,
  type ChallengeView,
  type RoomChallengeAnswers,
  type RoomChallengeResult,
  type RoundPlan,
} from "../types/breakout.ts";
import { assertInRoom, type RoomRef } from "./activity_responses.ts";
import { bumpChallengeRevision, bumpRoomRevision, getLive } from "./live.ts";
import { getRoundPlan } from "./round-plans.ts";
import { changeItem, readItem, roundItem } from "../services/dynamo.ts";
import { HttpError, isRecord, requiredString } from "../services/http-error.ts";

// Live polls and quizzes. The host launches one while a round runs; every room
// answers it as one. One list per round (item "round#<roundId>#challenges"), oldest first.
//
// Launch and reveal bump LiveState.challengeRevision, so every client refetches.
// A pick or a lock is room work and bumps only that room's counter.

interface StoredChallenge {
  id: string;
  draft: ChallengeDraft;
  launchedAt: number;
  endsAt: number;
  /** Set by the host's reveal or the round's close. Time running out reveals it too, on read. */
  revealed: boolean;
  /** roomId -> that room's picks and locks. Rooms that have not touched it are missing. */
  rooms: Record<string, RoomChallengeAnswers>;
}

interface RoundChallenges {
  challenges: StoredChallenge[];
}

const MAX_TITLE_LENGTH = 100;
const MAX_QUESTION_LENGTH = 300;
const MAX_OPTION_LENGTH = 120;
const MIN_DURATION_SEC = 15;
const MAX_DURATION_SEC = 900;

function itemOf(roundId: string): string {
  return roundItem(roundId, "challenges");
}

/** Shows the answers and every room's results to all rooms, and ends it: no lock is taken after a reveal. */
function isRevealed(challenge: StoredChallenge): boolean {
  return challenge.revealed || Date.now() > challenge.endsAt;
}

function boundedText(value: unknown, field: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0 || text.length > max) {
    throw new HttpError(`${field} must be 1 to ${max} characters.`, 400);
  }
  return text;
}

function wholeNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(`${field} must be a whole number from ${min} to ${max}.`, 400);
  }
  return value;
}

function parseQuestion(value: unknown, position: number): ChallengeQuestion {
  const field = `Question ${position + 1}`;
  if (!isRecord(value) || !Array.isArray(value.options)) throw new HttpError(`${field} needs text and options.`, 400);
  if (value.options.length < 2 || value.options.length > MAX_CHALLENGE_OPTIONS) {
    throw new HttpError(`${field} needs 2 to ${MAX_CHALLENGE_OPTIONS} options.`, 400);
  }
  return {
    text: boundedText(value.text, field, MAX_QUESTION_LENGTH),
    options: value.options.map((option, index) => boundedText(option, `${field}, option ${index + 1}`, MAX_OPTION_LENGTH)),
  };
}

/** The host's draft, checked and trimmed. A poll has one question; a quiz has a right answer for each. */
function parseDraft(value: unknown): ChallengeDraft {
  if (!isRecord(value) || !Array.isArray(value.questions)) throw new HttpError("draft must be an object with questions.", 400);
  if (value.kind !== "poll" && value.kind !== "quiz") throw new HttpError('kind must be "poll" or "quiz".', 400);
  const maxQuestions = value.kind === "poll" ? 1 : MAX_QUIZ_QUESTIONS;
  if (value.questions.length < 1 || value.questions.length > maxQuestions) {
    throw new HttpError(`A ${value.kind} holds 1 to ${maxQuestions} questions.`, 400);
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
    throw new HttpError("answerKey needs one right option per question.", 400);
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
function resultsFor(plan: RoundPlan | undefined, challenge: StoredChallenge): ChallengeResults {
  const { draft } = challenge;
  const answerKey = draft.kind === "quiz" ? draft.answerKey : null;
  const rooms: RoomChallengeResult[] = (plan?.rooms ?? []).map((room) => {
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
    questions: challenge.draft.questions,
    launchedAt: challenge.launchedAt,
    endsAt: challenge.endsAt,
    revealed: isRevealed(challenge),
    ...extra,
  };
}

async function readChallenges(parentUUID: string, roundId: string): Promise<StoredChallenge[]> {
  return (await readItem<RoundChallenges>(parentUUID, itemOf(roundId)))?.challenges ?? [];
}

async function assertRunning(parentUUID: string, roundId: string): Promise<void> {
  if ((await getLive(parentUUID)).round?.roundId !== roundId) throw new HttpError("This round is not running.", 409);
}

/** The host's view: every challenge this round, oldest first, each with live results. */
export async function getChallengesForHost(parentUUID: string, roundId: string): Promise<ChallengeView[]> {
  const plan = await getRoundPlan(parentUUID, roundId);
  return (await readChallenges(parentUUID, roundId)).map((challenge) =>
    viewOf(challenge, { room: null, results: resultsFor(plan, challenge) }),
  );
}

/** The latest challenge as one room member sees it: their room's work, and every room's results once revealed. */
export async function getRoomChallenge(room: RoomRef, participantUUID: unknown): Promise<ChallengeView | null> {
  await assertInRoom(room, requiredString(participantUUID, "participantUUID"));
  const latest = (await readChallenges(room.parentUUID, room.roundId)).at(-1);
  if (!latest) return null;
  return viewOf(latest, {
    room: latest.rooms[room.roomId] ?? emptyAnswers(latest.draft.questions.length),
    results: isRevealed(latest) ? resultsFor(await getRoundPlan(room.parentUUID, room.roundId), latest) : null,
  });
}

/** Only the running round takes a new one, and only after the last one was revealed. */
export async function launchChallenge(parentUUID: string, roundId: string, draftInput: unknown): Promise<ChallengeView[]> {
  const draft = parseDraft(draftInput);
  await assertRunning(parentUUID, roundId);
  await changeItem<RoundChallenges>(parentUUID, itemOf(roundId), (current) => {
    const list: RoundChallenges = current ?? { challenges: [] };
    if (!list.challenges.every(isRevealed)) {
      throw new HttpError("Reveal the running poll or quiz before launching another.", 409);
    }
    // The results reach every room by themselves when time is up; the host may reveal earlier.
    const launchedAt = Date.now();
    list.challenges.push({
      id: crypto.randomUUID(),
      draft,
      launchedAt,
      endsAt: launchedAt + draft.durationSec * 1000,
      revealed: false,
      rooms: {},
    });
    return list;
  });
  await bumpChallengeRevision(parentUUID);
  return getChallengesForHost(parentUUID, roundId);
}

/** Reveals the matching challenges not yet revealed by hand or by close. */
async function markRevealed(parentUUID: string, roundId: string, matches: (challenge: StoredChallenge) => boolean) {
  let changed = false;
  await changeItem<RoundChallenges>(parentUUID, itemOf(roundId), (list) => {
    if (!list?.challenges.some(matches)) throw new HttpError("No such poll or quiz in this round.", 404);
    for (const challenge of list.challenges.filter(matches)) {
      changed ||= !challenge.revealed;
      challenge.revealed = true;
    }
    return changed ? list : null;
  });
  if (changed) await bumpChallengeRevision(parentUUID);
}

/** The host reveals before time is up. Time running out reveals it anyway. */
export async function revealChallenge(parentUUID: string, roundId: string, challengeId: string): Promise<ChallengeView[]> {
  await markRevealed(parentUUID, roundId, (challenge) => challenge.id === challengeId);
  return getChallengesForHost(parentUUID, roundId);
}

/** Called when the round closes: a poll or quiz still open ends with it, so the host sees its results. */
export async function revealRoundChallenges(parentUUID: string, roundId: string): Promise<void> {
  if ((await readChallenges(parentUUID, roundId)).length > 0) await markRevealed(parentUUID, roundId, () => true);
}

/**
 * One room's answer to an open question, after the caller and the timing are
 * checked. `apply` writes it into the room's picks or locks.
 */
async function answerQuestion(
  room: RoomRef,
  challengeId: string,
  questionInput: string,
  request: unknown,
  apply: (answers: RoomChallengeAnswers, index: number, option: number, participantUUID: string) => void,
): Promise<ChallengeView | null> {
  if (!isRecord(request)) throw new HttpError("The request body must be an object.", 400);
  const participantUUID = requiredString(request.participantUUID, "participantUUID");
  await assertInRoom(room, participantUUID);
  await assertRunning(room.parentUUID, room.roundId);

  await changeItem<RoundChallenges>(room.parentUUID, itemOf(room.roundId), (list) => {
    const challenge = list?.challenges.find((candidate) => candidate.id === challengeId);
    if (!list || !challenge) throw new HttpError("No such poll or quiz in this round.", 404);
    if (isRevealed(challenge)) throw new HttpError("Time is up for this one.", 409);

    const questionCount = challenge.draft.questions.length;
    const index = wholeNumber(Number(questionInput), "question", 0, questionCount - 1);
    const option = wholeNumber(request.option, "option", 0, challenge.draft.questions[index].options.length - 1);
    const answers = (challenge.rooms[room.roomId] ??= emptyAnswers(questionCount));
    if (answers.locks[index]) throw new HttpError("Your room already locked this one in.", 409);
    apply(answers, index, option, participantUUID);
    return list;
  });
  await bumpRoomRevision(room.parentUUID, room.roomId);
  return getRoomChallenge(room, participantUUID);
}

/** One person's suggestion; the room sees it, nothing is final. */
export function pickOption(room: RoomRef, challengeId: string, question: string, request: unknown): Promise<ChallengeView | null> {
  return answerQuestion(room, challengeId, question, request, (answers, index, option, participantUUID) => {
    answers.picks[index][participantUUID] = option;
  });
}

/** The room's final answer to one question. Anyone in the room may lock it; the first lock wins. */
export function lockAnswer(room: RoomRef, challengeId: string, question: string, request: unknown): Promise<ChallengeView | null> {
  return answerQuestion(room, challengeId, question, request, (answers, index, option, participantUUID) => {
    answers.locks[index] = { option, participantUUID, at: Date.now() };
  });
}
