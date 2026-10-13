"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { draftWorkflowWithAi } from "@/lib/execution-api";
import { readAppContextToken } from "@/lib/zoom-sdk";
import type { AiChatMessage, WorkflowSnapshot } from "@/types/breakout";

/** One chat turn as the builder shows it: the host's text, the AI's question or its proposal. */
export type AiTurn =
  | { kind: "host"; text: string }
  | { kind: "question"; text: string }
  | { kind: "proposal"; workflow: WorkflowSnapshot };

export type AiAnswer = Exclude<AiTurn, { kind: "host" }>;

/** The chat as the backend reads it; a proposal is summed up in one line, its content travels as `draft`. */
function toMessages(turns: AiTurn[]): AiChatMessage[] {
  return turns.map((turn) => {
    if (turn.kind === "host") return { role: "host", text: turn.text };
    if (turn.kind === "question") return { role: "assistant", text: turn.text };
    return { role: "assistant", text: `Proposed workflow "${turn.workflow.title}" (${turn.workflow.rounds.length} rounds).` };
  });
}

/**
 * The AI builder chat. Kept apart from use-workspace (the saved workflow) and
 * use-workflow-library (templates): nothing here is saved until the host uses a proposal.
 */
export function useAiBuilder() {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);

  /** Adds the host's text to `history` and asks. Resolves with the answer; null when cancelled or failed. */
  async function ask(history: AiTurn[], text: string): Promise<AiAnswer | null> {
    const asked: AiTurn[] = [...history, { kind: "host", text }];
    // The latest proposal travels whole, so the AI changes only what the host asks.
    const lastDraft = history.findLast((turn) => turn.kind === "proposal")?.workflow ?? null;
    const controller = new AbortController();
    request.current = controller;
    setTurns(asked);
    setPending(true);
    try {
      const reply = await draftWorkflowWithAi(
        await readAppContextToken(),
        { messages: toMessages(asked), draft: lastDraft },
        controller.signal,
      );
      const answer: AiAnswer =
        reply.kind === "question" ? { kind: "question", text: reply.question } : { kind: "proposal", workflow: reply.workflow };
      setTurns([...asked, answer]);
      return answer;
    } catch (error) {
      setTurns(history);
      if (!controller.signal.aborted) {
        toast.error("Could not draft the workflow.", { description: error instanceof Error ? error.message : undefined });
      }
      return null;
    } finally {
      setPending(false);
    }
  }

  /** Continues the chat. */
  function send(text: string): Promise<AiAnswer | null> {
    return ask(turns, text);
  }

  /** Starts a new chat with this text. */
  function startNew(text: string): Promise<AiAnswer | null> {
    return ask([], text);
  }

  /** Stops waiting. The backend still finishes its call; the answer is dropped. */
  function cancel() {
    request.current?.abort();
  }

  function reset() {
    setTurns([]);
  }

  return { turns, pending, send, startNew, cancel, reset };
}
