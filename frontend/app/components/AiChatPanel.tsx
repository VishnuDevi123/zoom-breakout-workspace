"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AiTurn } from "@/lib/use-ai-builder";
import { formatClock } from "@/lib/round-clock";
import type { WorkflowSnapshot } from "@/types/breakout";

import { plural } from "./SaveTemplateModal";
import { GROUPING_OPTIONS, groupingOf } from "./screens/RoundsOverview";
import { Button, ConfirmModal, Spinner } from "./ui";

/**
 * The AI builder chat, sliding in from the right over the dimmed landing. On a
 * narrow panel it covers the whole screen and closes with a back arrow.
 * Rendered into <body> because the landing column is animated, which would
 * trap `position: fixed`.
 */
export default function AiChatPanel({
  turns,
  pending,
  hasWorkflow,
  onSend,
  onNewChat,
  onUse,
  onClose,
}: {
  turns: AiTurn[];
  pending: boolean;
  /** True when a workflow is being built, so using a proposal replaces it. */
  hasWorkflow: boolean;
  /** Resolves false when the send failed or was cancelled, so the composer gets its text back. */
  onSend: (text: string) => Promise<boolean>;
  onNewChat: () => void;
  onUse: (snapshot: WorkflowSnapshot) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [replacing, setReplacing] = useState<WorkflowSnapshot | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const request = text.trim();

  // Follow the newest turn, and the "thinking" line while waiting.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, pending]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !replacing) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // The message moves into the chat at once, so the box clears on send; a failed
  // send puts the text back for another try.
  async function send() {
    if (!request || pending) return;
    setText("");
    if (!(await onSend(request))) setText(request);
  }

  function use(workflow: WorkflowSnapshot) {
    if (hasWorkflow) setReplacing(workflow);
    else void onUse(workflow);
  }

  return createPortal(
    // No click-away close: a stray click must not hide the chat. × / ← / Escape close it.
    <div className="bw-ai-panel-backdrop">
      <aside className="bw-ai-panel" role="dialog" aria-modal="true" aria-label="Build with AI">
        <header className="bw-ai-panel__header">
          <button type="button" className="bw-ai-panel__back" aria-label="Back" onClick={onClose}>
            ←
          </button>
          <span className="bw-ai-prompt__spark" aria-hidden="true">✦</span>
          <span className="bw-ai-panel__title">Build with AI</span>
          <div className="bw-header-spacer" />
          <Button variant="ghost" size="sm" disabled={pending} onClick={onNewChat}>
            New chat
          </Button>
          <button type="button" className="bw-ai-panel__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="bw-ai-panel__chat">
          {turns.map((turn, index) =>
            turn.kind === "proposal" ? (
              <ProposalCard key={index} workflow={turn.workflow} disabled={pending} onUse={() => use(turn.workflow)} />
            ) : (
              <p key={index} className={`bw-ai-bubble bw-ai-bubble--${turn.kind}`}>
                {turn.text}
              </p>
            ),
          )}
          {pending ? (
            <p className="bw-ai-bubble bw-ai-bubble--question bw-ai-bubble--thinking" role="status">
              <Spinner /> Thinking…
            </p>
          ) : null}
          <div ref={end} />
        </div>

        <form
          className="bw-ai-panel__composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            className="bw-ai-prompt__input"
            value={text}
            maxLength={2000}
            placeholder="Reply or ask for changes…"
            aria-label="Reply to the AI"
            autoFocus
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" size="sm" aria-label="Send" disabled={!request || pending}>
            ↑
          </Button>
        </form>
      </aside>

      {replacing ? (
        <ConfirmModal
          title="Replace your workflow?"
          message="The workflow you are building is replaced: its rounds, rooms, tasks and activities are removed."
          confirmLabel="Replace"
          onConfirm={() => onUse(replacing)}
          onClose={() => setReplacing(null)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

/** One proposal: title, a summary line, the rounds with their times, and Use. */
function ProposalCard({ workflow, disabled, onUse }: { workflow: WorkflowSnapshot; disabled: boolean; onUse: () => void }) {
  const totalSec = workflow.rounds.reduce((sum, round) => sum + round.durationSec, 0);
  const grouping = GROUPING_OPTIONS.find((option) => option.id === groupingOf(workflow))?.label;

  return (
    <div className="bw-ai-proposal">
      <span className="bw-ai-proposal__lead">Here&apos;s your workflow:</span>
      <span className="bw-ai-proposal__title">{workflow.title}</span>
      <span className="bw-ai-proposal__meta">
        {plural(workflow.rounds.length, "round")} · {formatClock(totalSec)} · {grouping}
      </span>
      <ol className="bw-ai-proposal__rounds">
        {workflow.rounds.map((round, index) => (
          <li key={index} className="bw-ai-proposal__round">
            <span>
              {index + 1}. {round.title ?? `Round ${index + 1}`}
            </span>
            <span className="bw-mono">{formatClock(round.durationSec)}</span>
          </li>
        ))}
      </ol>
      <Button disabled={disabled} onClick={onUse}>
        Use this workflow
      </Button>
    </div>
  );
}
