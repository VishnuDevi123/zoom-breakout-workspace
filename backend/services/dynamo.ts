import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { HttpError } from "./http-error.ts";

// The SDK reads AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from the
// environment, or a local AWS CLI login when the keys are not set.
let client: DynamoDBDocumentClient | null = null;

/** One DynamoDB document client for the process; items go in and come out as plain objects. */
export function documentClient(): DynamoDBDocumentClient {
  client ??= DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    // Optional fields such as a round's null task stay null; undefined ones are dropped.
    marshallOptions: { removeUndefinedValues: true },
  });
  return client;
}

// Read when used, not at import: server.ts loads .env after its imports run.
function table(name: "TEMPLATES_TABLE" | "MEETINGS_TABLE"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export const templatesTable = () => table("TEMPLATES_TABLE");

// Meeting data: one item per record in MEETINGS_TABLE, partition key `parentUUID`, sort key
// `item` ("workspace", "live", "past", "round#<roundId>#plan", ...). Every item carries
// `revision`, checked on each write, and `expiresAt`: the TTL (epoch seconds) that deletes
// it a day after its last write, in case meeting.ended never came.
const meetingsTable = () => table("MEETINGS_TABLE");
const TTL_SEC = 24 * 60 * 60;

const nowSec = () => Math.floor(Date.now() / 1000);

/** A record as stored: its own fields plus the revision every write checks. */
export type Revised<T> = T & { revision: number };

/** The item key of one round's record; "#" in an id is refused, or a prefix could match another round. */
export function roundItem(roundId: string, ...parts: string[]): string {
  if ([roundId, ...parts].some((part) => part.includes("#"))) throw new HttpError("Ids cannot contain #.", 400);
  return ["round", roundId, ...parts].join("#");
}

/** One record, or undefined when missing or past its TTL (DynamoDB deletes expired items late). */
export async function readItem<T>(parentUUID: string, item: string): Promise<Revised<T> | undefined> {
  const { Item } = await documentClient().send(
    // Consistent, so a refetch after an SSE bump sees the write that caused it.
    new GetCommand({ TableName: meetingsTable(), Key: { parentUUID, item }, ConsistentRead: true }),
  );
  return Item && Item.expiresAt > nowSec() ? recordOf<T>(Item) : undefined;
}

/** Every record whose item starts with `prefix`, with its key; expired ones too when `all`. */
async function queryItems(parentUUID: string, prefix: string, all = false): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await documentClient().send(
      new QueryCommand({
        TableName: meetingsTable(),
        // DynamoDB refuses an empty prefix, so "" reads the whole meeting by its key alone.
        KeyConditionExpression: prefix ? "parentUUID = :meeting AND begins_with(#item, :prefix)" : "parentUUID = :meeting",
        ExpressionAttributeNames: prefix ? { "#item": "item" } : undefined,
        ExpressionAttributeValues: prefix ? { ":meeting": parentUUID, ":prefix": prefix } : { ":meeting": parentUUID },
        ConsistentRead: true,
        ExclusiveStartKey: start,
      }),
    );
    items.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return all ? items : items.filter((item) => (item.expiresAt as number) > nowSec());
}

export async function readItems<T>(parentUUID: string, prefix: string): Promise<Revised<T>[]> {
  return (await queryItems(parentUUID, prefix)).map((item) => recordOf<T>(item));
}

function recordOf<T>(item: Record<string, unknown>): Revised<T> {
  const { item: _key, expiresAt: _ttl, ...record } = item;
  return record as Revised<T>;
}

function revisionFrom(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpError("expectedRevision must be a non-negative safe integer.", 400);
  }
  return value;
}

/** Sends a conditional write; a failed condition means someone changed the record first: 409. */
async function sendChecked(command: PutCommand | DeleteCommand): Promise<void> {
  try {
    await documentClient().send(command as PutCommand);
  } catch (error) {
    if (!(error instanceof ConditionalCheckFailedException)) throw error;
    throw new HttpError("This changed since you loaded it. Reload and try again.", 409);
  }
}

/**
 * Writes a whole record if the stored one is still at `expectedRevision` (0: none
 * yet), and returns it with the next revision. An expired item still in the table counts as none.
 */
export async function saveItem<T extends object>(
  parentUUID: string,
  item: string,
  record: T,
  expectedRevision: unknown,
): Promise<Revised<T>> {
  const expected = revisionFrom(expectedRevision);
  const saved = { ...record, revision: expected + 1 };
  const first = expected === 0;
  await sendChecked(
    new PutCommand({
      TableName: meetingsTable(),
      Item: { ...saved, parentUUID, item, expiresAt: nowSec() + TTL_SEC },
      ConditionExpression: first ? "attribute_not_exists(revision) OR expiresAt <= :now" : "revision = :expected AND expiresAt > :now",
      ExpressionAttributeValues: first ? { ":now": nowSec() } : { ":expected": expected, ":now": nowSec() },
    }),
  );
  return saved;
}

// One change at a time per record in this process, in arrival order, as when every
// store was an in-memory Map. The revision check covers a second instance during a deploy.
const queues = new Map<string, Promise<unknown>>();

/**
 * Read, change, write one record that the server changes (not the client, which
 * sends its own revision). `change` edits the record or returns null to write nothing.
 * Returns the record as written, or as read when nothing changed.
 */
export function changeItem<T extends object>(
  parentUUID: string,
  item: string,
  change: (current: Revised<T> | undefined) => T | null | Promise<T | null>,
): Promise<Revised<T> | undefined> {
  const key = `${parentUUID}\n${item}`;
  const run = (queues.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const current = await readItem<T>(parentUUID, item);
      const next = await change(current);
      if (!next) return current;
      return saveItem(parentUUID, item, next, current?.revision ?? 0).catch((error: unknown) => {
        // Only another instance can change it under the queue: rare, during a deploy.
        if (error instanceof HttpError && error.status === 409) throw new HttpError("Busy. Try again.", 503);
        throw error;
      });
    });
  queues.set(key, run);
  const settle = () => {
    if (queues.get(key) === run) queues.delete(key);
  };
  run.then(settle, settle);
  return run;
}

/** Deletes one record if it is still at `revision`; 409 otherwise. */
export async function deleteItem(parentUUID: string, item: string, revision: unknown): Promise<void> {
  await sendChecked(
    new DeleteCommand({
      TableName: meetingsTable(),
      Key: { parentUUID, item },
      ConditionExpression: "revision = :revision",
      ExpressionAttributeValues: { ":revision": revisionFrom(revision) },
    }),
  );
}

/** Deletes every record whose item starts with `prefix`; "" deletes the whole meeting. */
export async function deleteItems(parentUUID: string, prefix: string): Promise<void> {
  const items = await queryItems(parentUUID, prefix, true);
  for (let start = 0; start < items.length; start += 25) {
    let requests = items.slice(start, start + 25).map(({ item }) => ({ DeleteRequest: { Key: { parentUUID, item } } }));
    // The API may hand back part of a batch; it must be sent again.
    while (requests.length > 0) {
      const result = await documentClient().send(new BatchWriteCommand({ RequestItems: { [meetingsTable()]: requests } }));
      requests = (result.UnprocessedItems?.[meetingsTable()] ?? []) as typeof requests;
    }
  }
}
