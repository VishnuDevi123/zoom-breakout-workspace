import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient, templatesTable } from "../services/dynamo.ts";
import type { PastWorkflow, SavedTemplate, WorkflowSnapshot } from "../types/breakout.ts";

// Ended workflows per meeting stay in memory (a restart loses them, by choice).
// Saved templates live in DynamoDB, one item per template: partition key `ownerUid`
// (the Zoom user id from services/app-context.ts), sort key `id`. No participant data.
const pastWorkflows = new Map<string, PastWorkflow[]>();

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
export async function saveTemplate(ownerUid: string, input: unknown): Promise<SavedTemplate> {
  if (!isRecord(input)) throw new TemplateError("The request body must be an object.", 400);
  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const pastWorkflowId = requiredString(input.pastWorkflowId, "pastWorkflowId");

  const past = pastWorkflows.get(parentUUID)?.find((workflow) => workflow.id === pastWorkflowId);
  if (!past) throw new TemplateError("No past workflow with this ID in this meeting.", 404);
  return addTemplate(ownerUid, snapshotOf(past));
}

/** Add a workflow without people to the owner's templates. */
export async function addTemplate(ownerUid: string, snapshot: WorkflowSnapshot): Promise<SavedTemplate> {
  const saved: SavedTemplate = { ...structuredClone(snapshot), id: crypto.randomUUID(), ownerUid, savedAt: new Date().toISOString() };
  await documentClient().send(new PutCommand({ TableName: templatesTable(), Item: saved }));
  return saved;
}

/** Remove one of the owner's templates. Returns what is left, newest first. */
export async function deleteTemplate(ownerUid: string, templateId: unknown): Promise<SavedTemplate[]> {
  const id = requiredString(templateId, "templateId");
  try {
    await documentClient().send(
      new DeleteCommand({
        TableName: templatesTable(),
        Key: { ownerUid, id },
        // The key holds the owner, so nobody can delete someone else's template.
        ConditionExpression: "attribute_exists(id)",
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new TemplateError("No saved template with this ID.", 404);
    }
    throw error;
  }
  return getTemplates(ownerUid);
}

/** The owner's templates, newest first. One query: a host has a handful, far below a page (1 MB). */
export async function getTemplates(ownerUid: string): Promise<SavedTemplate[]> {
  const result = await documentClient().send(
    new QueryCommand({
      TableName: templatesTable(),
      KeyConditionExpression: "ownerUid = :owner",
      ExpressionAttributeValues: { ":owner": ownerUid },
    }),
  );
  const templates = (result.Items ?? []) as SavedTemplate[];
  return templates.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
