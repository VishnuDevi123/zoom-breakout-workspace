"use client";

import { useState } from "react";

import { formatClock, useRemainingSec } from "@/lib/round-clock";
import { useLiveState } from "@/lib/use-live-state";
import { useParticipantRound } from "@/lib/use-participant-round";
import type { LiveState, PlannedRoom } from "@/types/breakout";

import { Button, Card, SectionLabel, StatusDot } from "../ui";
import ParticipantWorkspace from "./ParticipantWorkspace";

const HOW_IT_WORKS = [
  "Your task stays on screen for the whole round",
  "If the host changes the task while you work, the sections updates on its own.",
];

/**
 * The participant's landing page.
 *
 * Everything here is read-only: a participant never calls a breakout method.
 * The running round arrives over SSE, room membership comes from the host's
 * saved draft, and the task comes from the task store. Three states, in the
 * order they are checked: no round running, running but staying in main, and
 * placed in a room.
 */
export default function ParticipantScreen({
  parentUUID,
  participantUUID,
}: {
  parentUUID: string;
  participantUUID: string;
}) {
  const [showWorkspace, setShowWorkspace] = useState(false);
  const { liveState } = useLiveState(parentUUID);
  const roundId = liveState?.round?.roundId ?? "";
  const round = useParticipantRound({
    parentUUID,
    participantUUID,
    roundId,
    taskRevision: liveState?.taskRevision ?? 0,
  });
  const { room, task, roundTitle } = round;

  if (!roundId) {
    return <Waiting headline="No round running yet" lede="The host hasent started breakout rooms yet. Please standby! " />;
  }

  if (!room) {
    // The room page belongs to a placement, so losing one closes it.
    if (showWorkspace) setShowWorkspace(false);
    return (
      <Waiting
        headline="You are staying in the main room"
        lede="The host did not place you in a breakout room for this round."
      />
    );
  }

  if (showWorkspace) {
    return (
      <ParticipantWorkspace
        round={round}
        room={room}
        live={liveState}
        participantUUID={participantUUID}
        onBack={() => setShowWorkspace(false)}
      />
    );
  }

  return (
    <div className="bw-shell">
      <div className="bw-body">
        <main className="bw-main bw-participant-main">
          <SectionLabel>You are in a breakout room</SectionLabel>
          <h2 className="bw-landing-title">Welcome to {room.name}</h2>
          <p className="bw-landing-lede">
            {task ? task.goal : "No task yet. The host can add one while the round runs."}
          </p>

          <div className="bw-landing-cards">
            <Card className="bw-participant-card bw-participant-card--accent">
              <span className="bw-mono bw-participant-card__label bw-participant-card__label--accent">
                THIS ROUND
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{roundTitle}</span>
              <span style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--bw-muted-2)" }}>
                {task
                  ? `${task.instructions.length} instructions · ${task.resources.length} resources`
                  : "Nothing set yet"}
              </span>
            </Card>

            <TimeCard endsAt={liveState?.round?.endsAt ?? 0} />
          </div>

          <Roster room={room} live={liveState} participantUUID={participantUUID} />

          <Button onClick={() => setShowWorkspace(true)}>
            See the current round tasks
          </Button>
        </main>

        <aside className="bw-rail">
          <SectionLabel>How this works</SectionLabel>
          {HOW_IT_WORKS.map((line, index) => (
            <div className="bw-participant-step" key={line}>
              <span className="bw-mono bw-participant-step__number">{index + 1}</span>
              <span>{line}</span>
            </div>
          ))}
          <Card tone="sunken" className="bw-participant-note">
            Your room and your task follow you. Nothing here is visible to the other rooms.
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** The two states that come before a room: no round, or not placed in one. */
function Waiting({ headline, lede }: { headline: string; lede: string }) {
  return (
    <div className="bw-shell">
      <div className="bw-body">
        <main className="bw-main bw-participant-main">
          <SectionLabel>Breakout Workspace</SectionLabel>
          <h2 className="bw-landing-title">{headline}</h2>
          <p className="bw-landing-lede">{lede}</p>
        </main>
      </div>
    </div>
  );
}

function TimeCard({ endsAt }: { endsAt: number }) {
  const remainingSec = useRemainingSec(endsAt);

  return (
    <Card className="bw-participant-card">
      <span className="bw-mono bw-participant-card__label">TIME</span>
      <span className="bw-mono" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.5px" }}>
        {remainingSec === null ? "--:--" : formatClock(remainingSec)}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>
        {remainingSec === null ? "Runs until the host ends it" : "left in this round"}
      </span>
    </Card>
  );
}

/**
 * Who else is here. The planned count comes from the draft; the present count
 * comes from webhooks, and stays at zero until the first person enters, because
 * that is when the backend learns which Zoom room this is.
 */
function Roster({
  room,
  live,
  participantUUID,
}: {
  room: PlannedRoom;
  live: LiveState | null;
  participantUUID: string;
}) {
  const roomUUID = live?.round?.roomUUIDs[room.id] ?? null;
  const others = (live?.participants ?? []).filter(
    (p) => p.location === roomUUID && p.participantUUID !== participantUUID,
  );
  const names = others.map((p) => p.name).filter(Boolean);

  return (
    <div className="bw-participant-roster">
      <StatusDot color={room.dot} />
      <span style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>With you:</span>
      <span style={{ fontSize: 11.5 }}>
        {names.length > 0 ? names.join(", ") : "nobody else has arrived yet"}
      </span>
      <div style={{ flex: 1 }} />
      <span className="bw-mono" style={{ fontSize: 11, color: "var(--bw-muted-3)" }}>
        {others.length + 1} of {room.participantUUIDs.length} here
      </span>
    </div>
  );
}
