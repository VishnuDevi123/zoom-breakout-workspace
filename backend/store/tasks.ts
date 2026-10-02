import type { Activity, CheckListItem, RoomTask, RoundTasks, SaveRoundTasksRequest } from "../types/breakout.ts";
import { pruneResponses } from "./activity_responses.ts";
import { bumpTaskRevision } from "./live.ts";

// One record per (parentUUID, roundId). Separate from round-plans: tasks change
// after launch, drafts do not.
const tasks = new Map<string, RoundTasks>();
const MAX_ACTIVITIES = 6;
const CHECKLIST_ITEMS = 6;
const MAX_LINES = 20;
const MAX_LINE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;

export class TaskError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "TaskError";
  }
}

function key(parentUUID: string, roundId: string): string {
  return `${parentUUID}:${roundId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TaskError(`${field} must be a non-empty string.`, 400);
  }
  return value;
}

/** Trimmed, non-empty lines only. Empty array allowed. */
function stringLines(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_LINES) {
    throw new TaskError(`${field} must be an array of 0 to ${MAX_LINES} lines.`, 400);
  }
  return value
    .map((line: unknown, index: number) => {
      if (typeof line !== "string" || line.length > MAX_LINE_LENGTH) {
        throw new TaskError(
          `${field}[${index}] must be a string of at most ${MAX_LINE_LENGTH} characters.`,
          400,
        );
      }
      return line.trim();
    })
    .filter((line) => line.length > 0);
}

function validateRoomTask(value: unknown, field: string): RoomTask {
  if (!isRecord(value)) throw new TaskError(`${field} must be an object.`, 400);
  return {
    goal: requiredString(value.goal, `${field}.goal`).trim(),
    instructions: stringLines(value.instructions, `${field}.instructions`),
    resources: stringLines(value.resources, `${field}.resources`),
    // Undefined until the frontend sends the field.
    checklist: validateChecklistItems(value.checklist ?? [], `${field}.checklist`),
  };
}

/** Non-empty, trimmed, at most MAX_LINE_LENGTH characters. for activities */
function title(value: unknown, field: string): string {
  const text = requiredString(value, field).trim();
  if (text.length > MAX_LINE_LENGTH) {
    throw new TaskError(`${field} must be at most ${MAX_LINE_LENGTH} characters.`, 400);
  }
  return text;
}

/** May be empty. Trimmed, at most MAX_DESCRIPTION_LENGTH characters. */
function description(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > MAX_DESCRIPTION_LENGTH) {
    throw new TaskError(`${field} must be a string of at most ${MAX_DESCRIPTION_LENGTH} characters.`, 400);
  }
  return value.trim();
}

/** Participant writes find activities and checklist items by id, so ids must not repeat. */
function assertUniqueIds(entries: { id: string }[], field: string): void {
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) throw new TaskError(`${field} ids must be unique.`, 400);
}

function validateChecklistItems(value: unknown, field: string): CheckListItem[] {
  if (!Array.isArray(value) || value.length > CHECKLIST_ITEMS) {
    throw new TaskError(`${field} must be an array of 0 to ${CHECKLIST_ITEMS} items.`, 400);
  }
  const items = value.map((item: unknown, index: number) => {
    if (!isRecord(item)) throw new TaskError(`${field}[${index}] must be an object.`, 400);
    return {
      id: requiredString(item.id, `${field}[${index}].id`),
      label: title(item.label, `${field}[${index}].label`),
    };
  });
  assertUniqueIds(items, field);
  return items;
}

/** One host-written activity. Only the fields of its kind are kept. */
function validateActivity(value: unknown, field: string): Activity {
  if (!isRecord(value)) throw new TaskError(`${field} must be an object.`, 400);
  const id = requiredString(value.id, `${field}.id`);
  const activityTitle = title(value.title, `${field}.title`);

  switch (value.kind) {
    case "individual":
    case "ideaBoard":
      return {
        kind: value.kind,
        id,
        title: activityTitle,
        description: description(value.description, `${field}.description`),
      };
    default:
      throw new TaskError(`${field}.kind must be individual or ideaBoard.`, 400);
  }
}

/** Undefined means none: the frontend does not send activities until the host editor ships. */
function validateActivities(value: unknown): Activity[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ACTIVITIES) {
    throw new TaskError(`activities must be an array of 0 to ${MAX_ACTIVITIES} activities.`, 400);
  }
  const activities = value.map((activity: unknown, index: number) =>
    validateActivity(activity, `activities[${index}]`),
  );
  assertUniqueIds(activities, "activities");
  return activities;
}

function validateSaveRequest(input: unknown): Omit<SaveRoundTasksRequest, "expectedRevision"> {
  if (!isRecord(input)) throw new TaskError("The tasks must be an object.", 400);
  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const roundId = requiredString(input.roundId, "roundId");

  const all = input.all === null || input.all === undefined ? null : validateRoomTask(input.all, "all");

  if (!isRecord(input.rooms)) throw new TaskError("rooms must be an object.", 400);
  const rooms: Record<string, RoomTask> = {};
  for (const [roomId, task] of Object.entries(input.rooms)) {
    rooms[requiredString(roomId, "rooms key")] = validateRoomTask(task, `rooms.${roomId}`);
  }

  return { parentUUID, roundId, all, rooms, activities: validateActivities(input.activities) };
}

function checkRevision(stored: RoundTasks | undefined, expectedRevision: unknown): number {
  if (
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new TaskError("expectedRevision must be a non-negative safe integer.", 400);
  }
  const currentRevision = stored?.revision ?? 0;
  if (expectedRevision !== currentRevision) {
    throw new TaskError(
      `The tasks changed. Expected revision ${expectedRevision}, but current revision is ${currentRevision}. Reload before saving again.`,
      409,
    );
  }
  return currentRevision;
}

/** GET does not create. Undefined means no tasks saved for this round yet. */
export function getRoundTasks(parentUUID: unknown, roundId: unknown): RoundTasks | undefined {
  const stored = tasks.get(
    key(requiredString(parentUUID, "parentUUID"), requiredString(roundId, "roundId")),
  );
  return stored ? structuredClone(stored) : undefined;
}

/** Create (expectedRevision 0) or replace. Whole record each time; no partial merge. */
export function saveRoundTasks(input: unknown, expectedRevision: unknown): RoundTasks {
  const draft = validateSaveRequest(input);
  const stored = tasks.get(key(draft.parentUUID, draft.roundId));
  const currentRevision = checkRevision(stored, expectedRevision);

  const saved: RoundTasks = { ...draft, revision: currentRevision + 1 };
  tasks.set(key(saved.parentUUID, saved.roundId), saved);
  bumpTaskRevision(saved.parentUUID);
  // A removed activity or checklist item takes what rooms wrote for it along.
  pruneResponses(saved);
  return structuredClone(saved);
}

/** Called by deleteRound in store/workspace.ts so a removed round leaves no tasks behind. */
export function deleteRoundTasks(parentUUID: string, roundId: string): void {
  tasks.delete(key(parentUUID, roundId));
}
