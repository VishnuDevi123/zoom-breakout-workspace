"use client";

import { useState, type ReactNode } from "react";

import { useAiBuilder } from "@/lib/use-ai-builder";
import type { WorkflowSnapshot } from "@/types/breakout";

import AiChatPanel from "../AiChatPanel";
import AiPrompt from "../AiPrompt";
import { BrandMark, Button, Card, ConfirmModal, StatusDot } from "../ui";

/**
 * First host screen. Shows what to do next and creates nothing until a button
 * is pressed. While a workflow runs it shows only that workflow: return to it
 * or end it. Otherwise: describe the session for AI, build it by hand or
 * continue the draft, then the library.
 */
export default function LandingScreen({
  meetingTopic,
  participantCount,
  workflow,
  ongoing,
  library,
  busy,
  onReturnToLive,
  onEndWorkflow,
  onBuildRounds,
  onStartRoundOne,
  onUse,
}: {
  meetingTopic: string;
  /** Null until the live stream delivers its first state. */
  participantCount: number | null;
  /** Null when the meeting has no workflow yet. */
  workflow: { title: string; roundCount: number } | null;
  /** Set from the first launch until End Workflow: the round on screen and whether it is open. */
  ongoing: { roundLabel: string; running: boolean } | null;
  /** Templates, saved templates and past workflows; hidden while a workflow runs. */
  library: ReactNode;
  busy: boolean;
  onReturnToLive: () => void;
  /** Closes an open round first. Reports its own errors. */
  onEndWorkflow: () => Promise<void>;
  /** Opens the workflow page, creating an empty workflow first when there is none. */
  onBuildRounds: () => void;
  onStartRoundOne: () => void;
  /** Replaces the workflow with an AI proposal and opens the workflow page. */
  onUse: (snapshot: WorkflowSnapshot) => Promise<void>;
}) {
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const ai = useAiBuilder();

  /** The landing prompt starts a new chat; the panel slides in with the first answer. */
  async function generate(text: string): Promise<boolean> {
    const answer = await ai.startNew(text);
    if (answer) setChatOpen(true);
    return answer !== null;
  }

  const presence =
    participantCount === null
      ? "connecting…"
      : `${participantCount} ${participantCount === 1 ? "person" : "people"}`;

  return (
    <div className="bw-shell">
      <header className="bw-header">
        <BrandMark />
        <div className="bw-round-heading">
          <span className="bw-header-title">Breakout Workspace</span>
          <span className="bw-header-subtitle">
            Hosting {meetingTopic || "this meeting"} · {presence}
          </span>
        </div>
        <div className="bw-header-spacer" />
      </header>

      <div className="bw-body">
        <main className="bw-main bw-landing-page">
          {/* Keyed by state so ending a workflow fades the page back in. */}
          <div key={ongoing ? "ongoing" : "home"} className="bw-landing">
            {ongoing ? (
              <Card className="bw-landing-card bw-landing-card--live">
                <div className="bw-landing-card__text">
                  <span className="bw-landing-card__status">
                    <StatusDot color="var(--bw-red)" round pulse /> Live
                  </span>
                  <span className="bw-landing-card__title">Ongoing Workflow</span>
                  <span className="bw-landing-card__meta">
                    {ongoing.running ? `${ongoing.roundLabel} is running` : `${ongoing.roundLabel} has ended`}
                  </span>
                </div>
                <div className="bw-landing-card__actions">
                  <Button variant="secondary" className="bw-button--danger-text" onClick={() => setConfirmingEnd(true)}>
                    End Workflow
                  </Button>
                  <Button onClick={onReturnToLive}>Return to live round</Button>
                </div>
              </Card>
            ) : (
              <>
                <div className="bw-landing-hero">
                  <h1 className="bw-landing-title">What&apos;s your session today?</h1>
                  <p className="bw-landing-subheading">Describe it and AI builds the rounds, rooms, tasks and activities.</p>
                </div>

                <AiPrompt pending={ai.pending} onGenerate={generate} onCancel={ai.cancel} />
                {ai.turns.length > 0 && !chatOpen && !ai.pending ? (
                  <button type="button" className="bw-ai-resume" onClick={() => setChatOpen(true)}>
                    Continue your AI chat ›
                  </button>
                ) : null}

                {/* Dimmed and out of reach (inert) while the AI works; only the prompt's Cancel stays live. */}
                <div className={`bw-landing-rest${ai.pending ? " bw-landing-rest--dimmed" : ""}`} inert={ai.pending}>
                <div className="bw-landing-divider">or build it yourself</div>

                {workflow ? (
                  <button type="button" className="bw-draft-card" disabled={busy} onClick={onBuildRounds}>
                    <span className="bw-draft-card__icon" aria-hidden="true">✎</span>
                    <span className="bw-draft-card__text">
                      <span className="bw-draft-card__label">Continue draft</span>
                      <span className="bw-draft-card__title">
                        {workflow.title} · {workflow.roundCount} {workflow.roundCount === 1 ? "round" : "rounds"}
                      </span>
                    </span>
                    <span className="bw-draft-card__chevron" aria-hidden="true">›</span>
                  </button>
                ) : (
                  <div className="bw-landing-builds">
                    <Button variant="secondary" size="lg" busy={busy} onClick={onBuildRounds}>
                      Build a workflow
                    </Button>
                    <Button variant="secondary" size="lg" disabled={busy} onClick={onStartRoundOne}>
                      Start with one round
                    </Button>
                  </div>
                )}

                {library}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {chatOpen ? (
        <AiChatPanel
          turns={ai.turns}
          pending={ai.pending}
          hasWorkflow={workflow !== null}
          onSend={async (text) => (await ai.send(text)) !== null}
          onNewChat={ai.reset}
          onUse={onUse}
          onClose={() => setChatOpen(false)}
        />
      ) : null}

      {confirmingEnd ? (
        <ConfirmModal
          title="End this workflow?"
          message={`${ongoing?.running ? "Everyone returns to the main room. " : ""}Participant answers are deleted. The rounds, rooms, tasks and activities move to Past workflows.`}
          confirmLabel="End Workflow"
          onConfirm={onEndWorkflow}
          onClose={() => setConfirmingEnd(false)}
        />
      ) : null}
    </div>
  );
}
