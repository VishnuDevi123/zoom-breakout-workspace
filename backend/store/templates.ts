import type { PastWorkflow, SavedTemplate, WorkflowSnapshot } from "../types/breakout.ts";

// Ended workflows per meeting, saved templates per Zoom user, newest first.
// The owner is the `uid` from the request's app context token (services/app-context.ts),
// the same in every meeting. In memory: a restart loses both, until templates move to the DB.
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

/** Copy one past workflow of this meeting into the owner's templates. */
export function saveTemplate(ownerUid: string, input: unknown): SavedTemplate {
  if (!isRecord(input)) throw new TemplateError("The request body must be an object.", 400);
  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const pastWorkflowId = requiredString(input.pastWorkflowId, "pastWorkflowId");

  const past = pastWorkflows.get(parentUUID)?.find((workflow) => workflow.id === pastWorkflowId);
  if (!past) throw new TemplateError("No past workflow with this ID in this meeting.", 404);
  return addTemplate(ownerUid, snapshotOf(past));
}

/** Add a workflow without people to the owner's templates, newest first. */
export function addTemplate(ownerUid: string, snapshot: WorkflowSnapshot): SavedTemplate {
  const saved: SavedTemplate = { ...structuredClone(snapshot), id: crypto.randomUUID(), ownerUid, savedAt: new Date().toISOString() };
  templates.set(ownerUid, [saved, ...(templates.get(ownerUid) ?? [])]);
  return structuredClone(saved);
}

/** Remove one of the owner's templates. Returns what is left, newest first. */
export function deleteTemplate(ownerUid: string, templateId: unknown): SavedTemplate[] {
  const id = requiredString(templateId, "templateId");
  const current = templates.get(ownerUid) ?? [];
  if (!current.some((template) => template.id === id)) {
    throw new TemplateError("No saved template with this ID.", 404);
  }
  templates.set(ownerUid, current.filter((template) => template.id !== id));
  return getTemplates(ownerUid);
}

export function getTemplates(ownerUid: string): SavedTemplate[] {
  return structuredClone(templates.get(ownerUid) ?? []);
}
