"use client";

import { ROUND_TEMPLATES, type RoundTemplate } from "@/lib/round-templates";

import { BrandMark, Button, Card, SectionLabel } from "../ui";

const HOW_THIS_WORKS = [
  "1. Plan rounds, then give each one rooms and people.",
  "2. Launch - Zoom opens the rooms and moves everyone in.",
  "3. Watch who is where, then close and plan the next round.",
];

/** First host screen. Reads meeting facts; creates nothing until a button is pressed. */
export default function LandingScreen({
  meetingTopic,
  hostName,
  participantCount,
  roundCount,
  busy,
  onStartRoundOne,
  onBuildRounds,
  onUseTemplate,
}: {
  meetingTopic: string;
  hostName: string;
  /** Null until the live stream delivers its first state. */
  participantCount: number | null;
  /** Null when the meeting has no workspace yet. */
  roundCount: number | null;
  busy: boolean;
  onStartRoundOne: () => void;
  onBuildRounds: () => void;
  onUseTemplate: (template: RoundTemplate) => void;
}) {
  const countText = participantCount === null ? "Connecting to the meeting…" : `Meeting occupancy: ${participantCount}.`;

  return (
    <div className="bw-shell">
      <header className="bw-header">
        <BrandMark />
        <div className="bw-round-heading">
          <span className="bw-header-title">Breakout Workspace</span>
          <span className="bw-header-subtitle">
            {"Create workflows and add activities!"}
          </span>
        </div>
        <div className="bw-header-spacer" />
      </header>

      <div className="bw-body">
        <main className="bw-main bw-landing">
          <SectionLabel>You are hosting this meeting</SectionLabel>
          <h1 className="bw-landing-title">{meetingTopic || "This meeting"}</h1>
          <p className="bw-landing-lede">
            {countText} Set up the rounds, and Zoom opens the rooms when you launch.
          </p>

          <div className="bw-landing-cards">
            <Card large>
              <SectionLabel>In the room</SectionLabel>
              <span className="bw-landing-stat">{participantCount ?? "–"}</span>
              <span style={{ fontSize: "var(--bw-fs-secondary)", color: "var(--bw-muted-2)" }}>people waiting · no breakout rooms yet</span>
            </Card>
            {roundCount !== null ? (
              <Card large tone="sunken">
                <SectionLabel>Start from</SectionLabel>
                <span style={{ fontSize: "var(--bw-fs-title)", fontWeight: 600 }}>{roundCount} {roundCount === 1 ? "round" : "rounds"} planned</span>
                <span style={{ fontSize: "var(--bw-fs-secondary)", color: "var(--bw-muted-2)" }}>Edit anything before you launch.</span>
              </Card>
            ) : null}
          </div>

          {roundCount === null ? (
            <div className="bw-landing-starts">
              <span style={{ fontSize: "var(--bw-fs-secondary)", color: "var(--bw-muted-2)" }}>Other starts:</span>
              {ROUND_TEMPLATES.map((template) => (
                <Button key={template.name} variant="secondary" size="sm" disabled={busy} onClick={() => onUseTemplate(template)}>
                  {template.name} · {template.rounds.length} rounds
                </Button>
              ))}
            </div>
          ) : null}

          <div className="bw-landing-actions">
            {roundCount === null ? (
              <Button variant="secondary" disabled={busy} onClick={onStartRoundOne}>Start Round 1</Button>
            ) : null}
            <Button variant="primary" disabled={busy} onClick={onBuildRounds}>
              {roundCount === null ? "Build the rounds" : "Open the ongoing rounds"}
            </Button>
          </div>
        </main>

        <aside className="bw-rail">
          <SectionLabel>How this works</SectionLabel>
          <ol className="bw-landing-steps">
            {HOW_THIS_WORKS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

        </aside>
      </div>
    </div>
  );
}
