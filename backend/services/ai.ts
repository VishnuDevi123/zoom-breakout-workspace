import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type {
  AiChatMessage,
  DraftWorkflowRequest,
  DraftWorkflowResponse,
  WorkflowSnapshot,
} from "../types/breakout.ts";

// From the OpenAI structured outputs docs; change here to try another model.
const MODEL = "gpt-6-luna";
const MAX_REQUEST_LENGTH = 2000;

/** 400: bad request body. 422: the model refused or returned nothing. 502: the OpenAI call failed. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 422 | 502,
  ) {
    super(message);
    this.name = "AiError";
  }
}

// The SDK reads OPENAI_API_KEY in its constructor, and server.ts loads .env after
// its imports have run, so the client is built on the first request.
let openai: OpenAI | null = null;
function client(): OpenAI {
  openai ??= new OpenAI();
  return openai;
}

// What the model fills in. Mirrors WorkflowSnapshot without ids (the server assigns
// them) and with minutes instead of seconds. Limits copy the store validators.
const ActivityDraft = z.object({
  kind: z.enum(["individual", "ideaBoard"]),
  title: z.string().min(1).max(500),
  description: z.string().max(2000),
});

const TaskDraft = z.object({
  goal: z.string().min(1).max(500),
  instructions: z.array(z.string().max(500)).max(20),
  resources: z.array(z.string().max(500)).max(20),
  checklist: z.array(z.string().min(1).max(500)).max(6),
});

const RoundDraft = z.object({
  title: z.string().nullable(),
  durationMinutes: z.number().int().min(1).max(120),
  roomNames: z.array(z.string().min(1)).min(1).max(50),
  task: TaskDraft.nullable(),
  activities: z.array(ActivityDraft).max(6),
});

// The host picks one of three groupings (RoundsOverview); the workspace stores two flags.
const Grouping = z.enum(["same", "new", "each"]);

const GROUPING_FLAGS: Record<
  z.infer<typeof Grouping>,
  Pick<WorkflowSnapshot, "sameRoomsEveryRound" | "samePeopleEveryRound">
> = {
  same: { sameRoomsEveryRound: true, samePeopleEveryRound: true },
  new: { sameRoomsEveryRound: true, samePeopleEveryRound: false },
  each: { sameRoomsEveryRound: false, samePeopleEveryRound: false },
};

const WorkflowDraft = z.object({
  title: z.string().min(1),
  grouping: Grouping,
  autoStartNextRound: z.boolean(),
  rounds: z.array(RoundDraft).min(1).max(20),
});

type WorkflowDraft = z.infer<typeof WorkflowDraft>;

// The model either asks the host for missing details or proposes a workflow.
const DraftReply = z.object({
  reply: z.union([
    z.object({ kind: z.literal("question"), question: z.string().min(1).max(500) }),
    z.object({ kind: z.literal("workflow"), workflow: WorkflowDraft }),
  ]),
});

const SYSTEM_PROMPT = `You design breakout-room workflows for a Zoom meeting host.

A workflow is a list of rounds. In each round the participants split into breakout rooms for a set time.
- title: a round's title, or null. A null title shows as "Round 1", "Round 2" and so on, so use null instead of a title that only repeats the round number.
- roomNames: one name per room. The number of names is the room count. Use short names that fit the activity, or "Room 1", "Room 2" and so on.
- task: what every room works on. goal is one sentence; instructions are short steps; checklist items are things the room ticks off together. Use null for a round with no task.
- activities: questions for participants. "individual" = each person writes a private answer to the host. "ideaBoard" = the room posts shared sticky notes. title is the question; description adds a clue or context, or is empty.
- grouping: how people are grouped across rounds.
  - "same": same groups every round. The same rooms and the same people in each room. Give every round identical roomNames.
  - "new": new groups each round. The same rooms, with people mixed up each round. Give every round identical roomNames.
  - "each": the host sets up each round. Every round has its own rooms and people.
- autoStartNextRound: true when the next round should start as soon as the timer ends; false when the host starts each round.

Ask or propose:
- Reply with kind "question" when you cannot tell what the session is for: no topic, goal or kind of activity. Ask one short question that covers everything missing, for example the topic, the number of people and the total time.
- Do not ask about details you can choose yourself (room names, grouping, durations, activity wording). Choose sensible ones and reply with kind "workflow".
- When the host has already answered one of your questions, or says to go ahead, reply with kind "workflow" and fill any gaps with sensible choices.

Rules:
- Leave resources empty unless the host gives URLs. Never invent links.
- Follow the host's numbers for rounds, rooms and minutes exactly. When the host gives none, choose sensible ones for the activity.
- When a current draft is given, change only what the host asks and keep the rest as it is.
- Leave the autoStartNextRound flag false unless the host says to start automatically.
`;

const MAX_MESSAGES = 20;

/** The request body: the chat so far, ending with the host's turn, and the last proposal when refining. */
function validateRequest(input: unknown): DraftWorkflowRequest {
  if (typeof input !== "object" || input === null) {
    throw new AiError("The request body must be an object.", 400);
  }
  const { messages, draft } = input as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new AiError(`messages must contain 1 to ${MAX_MESSAGES} messages.`, 400);
  }
  const chat = messages.map((message: unknown, index: number): AiChatMessage => {
    const { role, text } = (message ?? {}) as Record<string, unknown>;
    if (role !== "host" && role !== "assistant") {
      throw new AiError(`messages[${index}].role must be host or assistant.`, 400);
    }
    if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_REQUEST_LENGTH) {
      throw new AiError(`messages[${index}].text must be a non-empty string of at most ${MAX_REQUEST_LENGTH} characters.`, 400);
    }
    return { role, text: text.trim() };
  });
  if (chat[chat.length - 1].role !== "host") {
    throw new AiError("The last message must be the host's.", 400);
  }
  // The draft only steers the model; replace validates whatever the host applies.
  return { messages: chat, draft: (draft ?? null) as WorkflowSnapshot | null };
}

/** The chat as model input. The current draft goes before the host's last turn. */
function modelInput({ messages, draft }: DraftWorkflowRequest): OpenAI.Responses.ResponseInputItem[] {
  const turns = messages.map(({ role, text }) => ({
    role: role === "host" ? ("user" as const) : ("assistant" as const),
    content: text,
  }));
  if (!draft) return turns;
  const draftTurn = { role: "user" as const, content: `Current draft:\n${JSON.stringify(draft)}` };
  return [...turns.slice(0, -1), draftTurn, turns[turns.length - 1]];
}

/** The model's refusal message, if it declined. */
function refusalText(response: OpenAI.Responses.Response): string | null {
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const content of item.content) {
      if (content.type === "refusal") return content.refusal;
    }
  }
  return null;
}

/** Maps the grouping to the workspace flags, adds the ids the stores need and converts minutes to seconds. */
export function toSnapshot({ grouping, ...draft }: WorkflowDraft): WorkflowSnapshot {
  return {
    ...draft,
    ...GROUPING_FLAGS[grouping],
    rounds: draft.rounds.map(({ durationMinutes, task, activities, ...round }) => ({
      ...round,
      durationSec: durationMinutes * 60,
      task: task
        ? { ...task, checklist: task.checklist.map((label) => ({ id: crypto.randomUUID(), label })) }
        : null,
      activities: activities.map((activity) => ({ ...activity, id: crypto.randomUUID() })),
    })),
  };
}

/** Asks the model for a workflow, or for the details it needs first. Saves nothing: the host applies a workflow through POST /api/workspace/replace. */
export async function draftWorkflow(input: unknown): Promise<DraftWorkflowResponse> {
  const request = validateRequest(input);

  let response;
  try {
    response = await client().responses.parse({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      input: modelInput(request),
      text: { format: zodTextFormat(DraftReply, "draft_reply") },
    });
  } catch (error) {
    if (!(error instanceof OpenAI.APIError)) throw error;
    console.error("OpenAI request failed:", error.status, error.message);
    throw new AiError("The AI service is unavailable. Try again.", 502);
  }

  if (!response.output_parsed) {
    throw new AiError(refusalText(response) ?? "The AI returned no workflow. Try rephrasing.", 422);
  }
  const { reply } = response.output_parsed;
  if (reply.kind === "question") return reply;
  return { kind: "workflow", workflow: toSnapshot(reply.workflow) };
}
