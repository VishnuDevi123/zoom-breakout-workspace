import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { changeItem, documentClient, readItem, templatesTable } from "../services/dynamo.ts";
import type { PastWorkflow, SavedTemplate, WorkflowSnapshot } from "../types/breakout.ts";
import { HttpError, isRecord, requiredString } from "../services/http-error.ts";

// Ended workflows are one meeting record (item "past"), newest first.
// Saved templates live in TEMPLATES_TABLE, one item per template: partition key `ownerUid`
// (the Zoom user id from services/app-context.ts), sort key `id`. No participant data.
interface PastWorkflows {
  workflows: PastWorkflow[];
}

function snapshotOf(past: PastWorkflow): WorkflowSnapshot {
  return {
    title: past.title,
    sameRoomsEveryRound: past.sameRoomsEveryRound,
    samePeopleEveryRound: past.samePeopleEveryRound,
    autoStartNextRound: past.autoStartNextRound,
    rounds: past.rounds,
  };
}

/** Called by endWorkflow in store/workspace.ts. Returns the meeting's past workflows. */
export async function addPastWorkflow(parentUUID: string, snapshot: WorkflowSnapshot): Promise<PastWorkflow[]> {
  const past: PastWorkflow = { ...snapshot, id: crypto.randomUUID(), endedAt: new Date().toISOString() };
  const saved = await changeItem<PastWorkflows>(parentUUID, "past", (current) => ({
    workflows: [past, ...(current?.workflows ?? [])],
  }));
  return saved?.workflows ?? [];
}

export async function getPastWorkflows(parentUUID: string): Promise<PastWorkflow[]> {
  return (await readItem<PastWorkflows>(parentUUID, "past"))?.workflows ?? [];
}

/** Copy one past workflow of this meeting into the owner's templates. */
export async function saveTemplate(ownerUid: string, input: unknown): Promise<SavedTemplate> {
  if (!isRecord(input)) throw new HttpError("The request body must be an object.", 400);
  const parentUUID = requiredString(input.parentUUID, "parentUUID");
  const pastWorkflowId = requiredString(input.pastWorkflowId, "pastWorkflowId");

  const past = (await getPastWorkflows(parentUUID)).find((workflow) => workflow.id === pastWorkflowId);
  if (!past) throw new HttpError("No past workflow with this ID in this meeting.", 404);
  const templates = await getTemplates(ownerUid);
  if (templates.some((template) => template.sourcePastWorkflowId === pastWorkflowId)) {
    throw new HttpError("This past workflow is already saved.", 409);
  }
  return addTemplate(ownerUid, snapshotOf(past), pastWorkflowId);
}

/** Add a workflow without people to the owner's templates. */
export async function addTemplate(
  ownerUid: string,
  snapshot: WorkflowSnapshot,
  sourcePastWorkflowId?: string,
): Promise<SavedTemplate> {
  const saved: SavedTemplate = {
    ...snapshot,
    id: crypto.randomUUID(),
    ownerUid,
    savedAt: new Date().toISOString(),
    sourcePastWorkflowId,
  };
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
      throw new HttpError("No saved template with this ID.", 404);
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
