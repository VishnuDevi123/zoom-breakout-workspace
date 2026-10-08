"use client";

import { formatClock } from "@/lib/round-clock";
import { ROUND_TEMPLATES, type RoundTemplate } from "@/lib/round-templates";

import { BrandMark, Button, Card, SectionLabel, StatusDot } from "../ui";

/**
 * First host screen. Shows what to do next and creates nothing until a button
 * is pressed: return to a running round, continue a workflow, or start one.
 */
export default function LandingScreen({
  meetingTopic,
  participantCount,
  workflow,
  liveRoundLabel,
  busy,
  onReturnToLive,
  onBuildRounds,
  onStartRoundOne,
  onUseTemplate,
}: {
  meetingTopic: string;
  /** Null until the live stream delivers its first state. */
  participantCount: number | null;
  /** Null when the meeting has no workflow yet. */
  workflow: { title: string; roundCount: number } | null;
  /** The running round's name, or null when no round is running. */
  liveRoundLabel: string | null;
  busy: boolean;
  onReturnToLive: () => void;
  /** Opens the workflow page, creating an empty workflow first when there is none. */
  onBuildRounds: () => void;
  onStartRoundOne: () => void;
  onUseTemplate: (template: RoundTemplate) => void;
}) {
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
          <div className="bw-landing">
            <SectionLabel>You are hosting</SectionLabel>
            <h1 className="bw-landing-title">{meetingTopic || "This meeting"}</h1>
            <p className="bw-landing-lede">{presence}</p>

            {liveRoundLabel ? (
              <Card className="bw-landing-card bw-landing-card--live">
                <div className="bw-landing-card__text">
                  <span className="bw-landing-card__status">
                    <StatusDot color="var(--bw-red)" round pulse /> Live now
                  </span>
                  <span className="bw-landing-card__title">{liveRoundLabel} is running</span>
                </div>
                <Button onClick={onReturnToLive}>Return to live round</Button>
              </Card>
            ) : null}

            {workflow ? (
              <Card className="bw-landing-card">
                <div className="bw-landing-card__text">
                  <SectionLabel>Your workflow</SectionLabel>
                  <span className="bw-landing-card__title">{workflow.title}</span>
                  <span className="bw-landing-lede">
                    {workflow.roundCount} {workflow.roundCount === 1 ? "round" : "rounds"}
                  </span>
                </div>
                <Button variant={liveRoundLabel ? "secondary" : "primary"} disabled={busy} onClick={onBuildRounds}>
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

                <SectionLabel>Start from a template</SectionLabel>
                <div className="bw-template-list">
                  {ROUND_TEMPLATES.map((template) => (
                    <button
                      type="button"
                      key={template.name}
                      className="bw-template"
                      disabled={busy}
                      onClick={() => onUseTemplate(template)}
                    >
                      <span className="bw-template__name">{template.name}</span>
                      <span className="bw-template__meta">
                        {template.rounds.length} rounds ·{" "}
                        {formatClock(template.rounds.reduce((sum, round) => sum + round.durationSec, 0))}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
