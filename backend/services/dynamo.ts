import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

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

/** The saved templates table, from TEMPLATES_TABLE. */
export function templatesTable(): string {
  const table = process.env.TEMPLATES_TABLE;
  if (!table) throw new Error("TEMPLATES_TABLE is not set.");
  return table;
}
