"use client";

import { useState, type ReactNode } from "react";

import { BrandMark, Button, Card, ConfirmModal, SectionLabel, StatusDot } from "../ui";

/**
 * First host screen. Shows what to do next and creates nothing until a button
 * is pressed. While a workflow runs it shows only that workflow: return to it
 * or end it. Otherwise: continue or start a workflow, then the library.
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
}: {
  meetingTopic: string;
  /** Null until the live stream delivers its first state. */
  participantCount: number | null;
  /** Null when the meeting has no workflow yet. */
  workflow: { title: string; roundCount: number } | null;
  /** Set from the first launch until End Workflow: the round on screen and whether it is open. */
  ongoing: { roundLabel: string; running: boolean } | null;
  /** Past workflows, saved templates and samples; hidden while a workflow runs. */
  library: ReactNode;
  busy: boolean;
  onReturnToLive: () => void;
  /** Closes an open round first. Reports its own errors. */
  onEndWorkflow: () => Promise<void>;
  /** Opens the workflow page, creating an empty workflow first when there is none. */
  onBuildRounds: () => void;
  onStartRoundOne: () => void;
}) {
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const presence =
    participantCount === null
      ? "Connecting to the meeting…"
      : `${participantCount} ${participantCount === 1 ? "person" : "people"} in the meeting`;

  return (
    <div className="bw-shell">
      <header className="bw-header">
        <BrandMark />
        <div className="bw-round-heading">
          <span className="bw-header-title">Breakout Workspace</span>
          <span className="bw-header-subtitle">Plan and run breakout rounds</span>
        </div>
        <div className="bw-header-spacer" />
      </header>

      <div className="bw-body">
        <main className="bw-main bw-landing-page">
          {/* Keyed by state so ending a workflow fades the page back in. */}
          <div key={ongoing ? "ongoing" : "home"} className="bw-landing">
            <SectionLabel>You are hosting</SectionLabel>
            <h1 className="bw-landing-title">{meetingTopic || "This meeting"}</h1>
            <p className="bw-landing-lede">{presence}</p>

            {ongoing ? (
              <Card className="bw-landing-card bw-landing-card--live">
                <div className="bw-landing-card__text">
                  <span className="bw-landing-card__status">
                    <StatusDot color="var(--bw-red)" round pulse /> Live
                  </span>
                  <span className="bw-landing-card__title">Ongoing Workflow</span>
                  <span className="bw-landing-lede">
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
            ) : workflow ? (
              <Card className="bw-landing-card">
                <div className="bw-landing-card__text">
                  <SectionLabel>Your workflow</SectionLabel>
                  <span className="bw-landing-card__title">{workflow.title}</span>
                  <span className="bw-landing-lede">
                    {workflow.roundCount} {workflow.roundCount === 1 ? "round" : "rounds"}
                  </span>
                </div>
                <Button disabled={busy} onClick={onBuildRounds}>
                  Continue building
                </Button>
              </Card>
            ) : (
              <>
                <div className="bw-landing-actions">
                  <Button busy={busy} onClick={onBuildRounds}>
                    Build a workflow
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={onStartRoundOne}>
                    Start with one round
                  </Button>
                </div>
                <p className="bw-landing-hint">With one round, you can add more while it runs.</p>
              </>
            )}

            {ongoing ? null : library}
          </div>
        </main>
      </div>

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
