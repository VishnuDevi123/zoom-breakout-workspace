"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { formatClock, useRemainingSec } from "@/lib/round-clock";
import { useLiveState } from "@/lib/use-live-state";
import { useParticipantRound } from "@/lib/use-participant-round";
import { useEarlierRounds, type EarlierRound } from "@/lib/use-past-rounds";
import type { LiveState, PlannedRoom } from "@/types/breakout";

import { Button, Card, SectionLabel, StatusDot } from "../ui";
import LoadingScreen from "./LoadingScreen";
import WaitingScreen from "./WaitingScreen";
import ParticipantWorkspace from "./ParticipantWorkspace";
import PastRoundPage from "./PastRoundPage";

const HOW_IT_WORKS = [
  "Your task stays on screen for the whole round.",
  "If the host changes the task while you work, this page updates on its own.",
];

/**
 * The participant's landing page.
 *
 * Everything here is read-only: a participant never calls a breakout method.
 * The running round arrives over SSE, room membership comes from the host's
 * saved draft, and the task comes from the task store. Four states, in the
 * order they are checked: no round running, running but staying in main,
 * placed but still in the main room, and inside the room.
 */
export default function ParticipantScreen({
  parentUUID,
  participantUUID,
  onPromoted,
}: {
  parentUUID: string;
  participantUUID: string;
  /** The backend heard Zoom make this person a host or co-host; Zoom confirms before the screen changes. */
  onPromoted: () => void;
}) {
  const [showWorkspace, setShowWorkspace] = useState(false);
  const { liveState } = useLiveState(parentUUID);
  const roundId = liveState?.round?.roundId ?? "";
  const me = liveState?.participants.find((p) => p.participantUUID === participantUUID);
  // Empty when webhooks have not reported this person yet; then the plan alone decides.
  const location = me?.location ?? "";
  const promoted = me !== undefined && me.role !== "attendee";
  useEffect(() => {
    if (promoted) onPromoted();
  }, [promoted, onPromoted]);
  const round = useParticipantRound({
    parentUUID,
    participantUUID,
    roundId,
    taskRevision: liveState?.taskRevision ?? 0,
    location,
  });
  const { room, task, roundTitle } = round;
  const earlierRounds = useEarlierRounds(parentUUID, roundId);
  const [pastRound, setPastRound] = useState<EarlierRound | null>(null);

  // Someone reading a past round stays there when a round starts; a toast says so.
  const lastRoundId = useRef(roundId);
  useEffect(() => {
    if (pastRound && roundId && roundId !== lastRoundId.current) {
      toast("A new round has started.", { description: "Go back to see your room." });
    }
    lastRoundId.current = roundId;
  }, [roundId, pastRound]);

  const earlier = <EarlierRoundList rounds={earlierRounds} onOpen={setPastRound} />;

  // One spinner until the stream's first state and this round's plan and task are
  // in, so "no round" or "staying in main" never flashes before the real page.
  if (!liveState || !round.ready) return <LoadingScreen message="Finding your room…" />;

  if (pastRound) {
    return (
      <PastRoundPage
        parentUUID={parentUUID}
        participantUUID={participantUUID}
        round={pastRound}
        live={liveState}
        onBack={() => setPastRound(null)}
      />
    );
  }

  if (!roundId) {
    return (
      <WaitingScreen
        headline="No round running yet"
        lede="Your host hasn't started breakout rooms yet. When they do, this page will show your room and task."
      >
        {earlier}
      </WaitingScreen>
    );
  }

  // Moved since "not placed" was read (the host just placed them): keep the one spinner
  // until the new answer arrives, rather than showing a "staying in main" that is out of date.
  if (!room && round.rechecking) return <LoadingScreen message="Finding your room…" />;

  if (!room) {
    // The room page belongs to a placement, so losing one closes it.
    if (showWorkspace) setShowWorkspace(false);
    return (
      <WaitingScreen
        headline="You are staying in the main room"
        lede="Your host didn't place you in a breakout room this round."
      >
        {earlier}
      </WaitingScreen>
    );
  }

  if (location === "main") {
    // Placed, but not inside the room: just launched and not joined yet, or stepped back out.
    if (showWorkspace) setShowWorkspace(false);
    return (
      <WaitingScreen
        headline="You are in the main room"
        lede={`Your room for this round is ${room.name}. Open Zoom's Breakout Rooms button to join it.`}
      >
        {earlier}
      </WaitingScreen>
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
            {task
              ? task.goal || "Your host left steps for this room."
              : "No task yet. The host can add one while the round runs."}
          </p>

          <div className="bw-landing-cards">
            <Card className="bw-participant-card bw-participant-card--accent">
              <span className="bw-mono bw-participant-card__label bw-participant-card__label--accent">
                THIS ROUND
              </span>
              <span className="bw-participant-card__title">{roundTitle}</span>
              <span className="bw-participant-card__meta">
                {task
                  ? `${task.instructions.length} instructions · ${task.resources.length} resources`
                  : "Nothing set yet"}
              </span>
            </Card>

            <TimeCard endsAt={liveState?.round?.endsAt ?? 0} />
          </div>

          <Roster room={room} live={liveState} participantUUID={participantUUID} />

          <Button onClick={() => setShowWorkspace(true)}>
            Open your room&apos;s tasks
          </Button>

          {earlier}
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

/** The states before a room: no round, not placed, or placed but still in the main room. */
function TimeCard({ endsAt }: { endsAt: number }) {
  const remainingSec = useRemainingSec(endsAt);

  return (
    <Card className="bw-participant-card">
      <span className="bw-mono bw-participant-card__label">TIME</span>
      <span className="bw-mono bw-participant-card__clock">
        {remainingSec === null ? "--:--" : formatClock(remainingSec)}
      </span>
      <span className="bw-participant-card__meta">
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
      <span className="bw-participant-card__meta">With you:</span>
      <span className="bw-participant-roster__names">
        {names.length > 0 ? names.join(", ") : "nobody else has arrived yet"}
      </span>
      <span className="bw-mono bw-participant-roster__count">
        {others.length + 1} of {room.participantUUIDs.length} here
      </span>
    </div>
  );
}

/** Rounds that have run, oldest first; each opens read-only. Nothing shows before the first one ends. */
function EarlierRoundList({ rounds, onOpen }: { rounds: EarlierRound[]; onOpen: (round: EarlierRound) => void }) {
  if (rounds.length === 0) return null;

  return (
    <section className="bw-earlier" aria-label="Earlier rounds">
      <SectionLabel>Earlier rounds</SectionLabel>
      {rounds.map((round) => (
        <button type="button" key={round.roundId} className="bw-earlier__row" onClick={() => onOpen(round)}>
          <span className="bw-earlier__label">{round.label}</span>
          <span className="bw-results__chevron" aria-hidden>
            ›
          </span>
        </button>
      ))}
    </section>
  );
}
