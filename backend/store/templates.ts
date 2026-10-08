import type { PastWorkflow, SavedTemplate, WorkflowSnapshot } from "../types/breakout.ts";

// Ended workflows per meeting, saved templates per host, newest first.
// In memory: a restart loses both. hostUUID is the host's participantUUID for
// now, which is new in every meeting; getAppContext's uid replaces it later.
const pastWorkflows = new Map<string, PastWorkflow[]>();
const templates = new Map<string, SavedTemplate[]>();

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TemplateError(`${field} must be a non-empty string.`, 400);
  }
  return value;
}

function snapshotOf(past: PastWorkflow): WorkflowSnapshot {
  return {
    title: past.title,
    sameRoomsEveryRound: past.sameRoomsEveryRound,
    samePeopleEveryRound: past.samePeopleEveryRound,
    autoStartNextRound: past.autoStartNextRound,
    rounds: structuredClone(past.rounds),
  };
}

/** Called by endWorkflow in store/workspace.ts. Returns the meeting's past workflows. */
export function addPastWorkflow(parentUUID: string, snapshot: WorkflowSnapshot): PastWorkflow[] {
  const past: PastWorkflow = { ...structuredClone(snapshot), id: crypto.randomUUID(), endedAt: new Date().toISOString() };
  pastWorkflows.set(parentUUID, [past, ...(pastWorkflows.get(parentUUID) ?? [])]);
  return getPastWorkflows(parentUUID);
}

export function getPastWorkflows(parentUUID: unknown): PastWorkflow[] {
  return structuredClone(pastWorkflows.get(requiredString(parentUUID, "parentUUID")) ?? []);
}

/** Copy one past workflow of this meeting into the host's templates. */
export function saveTemplate(input: unknown): SavedTemplate {
  if (!isRecord(input)) throw new TemplateError("The request body must be an object.", 400);
  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const pastWorkflowId = requiredString(input.pastWorkflowId, "pastWorkflowId");
  const hostUUID = requiredString(input.hostUUID, "hostUUID");

  const past = pastWorkflows.get(parentUUID)?.find((workflow) => workflow.id === pastWorkflowId);
  if (!past) throw new TemplateError("No past workflow with this ID in this meeting.", 404);

  const saved: SavedTemplate = { ...snapshotOf(past), id: crypto.randomUUID(), hostUUID, savedAt: new Date().toISOString() };
  templates.set(hostUUID, [saved, ...(templates.get(hostUUID) ?? [])]);
  return structuredClone(saved);
}

export function getTemplates(hostUUID: unknown): SavedTemplate[] {
  return structuredClone(templates.get(requiredString(hostUUID, "hostUUID")) ?? []);
}
