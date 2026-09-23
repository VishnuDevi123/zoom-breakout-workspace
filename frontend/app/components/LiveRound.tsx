"use client";

import { initialsFrom } from "@/lib/participant-status";
import { formatClock, useRemainingSec } from "@/lib/round-clock";
import type { LiveOperationState } from "@/lib/use-live-room-controller";
import { roundLabel } from "@/lib/use-workspace";
import type { LiveParticipant, LiveState, RoundMeta, RoundPlanDraft, Workspace } from "@/types/breakout";

import { BrandMark, Button, Card, Pill, SectionLabel, StatusDot } from "./ui";

/**
 * The running round. Room names and dots come from the round's draft; who is
 * where comes from Zoom webhooks via LiveState. The timer counts down to the
 * backend's endsAt, and the backend decides when the round is actually over.
 */
export default function LiveRound({
  workspace,
  round,
  live,
  connected,
  operation,
  nextRound,
  onHome,
  onEndRound,
  onLaunchNext,
}: {
  workspace: Workspace;
  round: RoundPlanDraft;
  live: LiveState;
  connected: boolean;
  operation: LiveOperationState;
  nextRound: RoundMeta | null;
  onHome: () => void;
  onEndRound: () => void;
  onLaunchNext: () => void;
}) {
  const busy = operation.kind === "running";
  const open = live.round !== null;
  const remainingSec = useRemainingSec(live.round?.endsAt ?? 0);
  const participants = live.participants;

  function membersOf(roomId: string): LiveParticipant[] {
    const uuid = live.round?.roomUUIDs[roomId];
    return uuid ? participants.filter((p) => p.location === uuid) : [];
  }

  return (
    <div className="bw-shell">
      <header className="bw-header bw-live-header">
        <BrandMark onHome={onHome} />
        <Pill tone={open ? "teal" : "neutral"}>{open ? "Live" : "Closed"}</Pill>
        <div className="bw-round-heading">
          <span style={{ fontSize: 15, fontWeight: 600 }}>{round.title}</span>
          <span style={{ fontSize: 11, color: "var(--bw-ink)" }}>
            {connected ? "Receiving Zoom updates" : "Reconnecting…"}
          </span>
        </div>
        <div className="bw-header-spacer" />

        {remainingSec !== null ? (
          <div className="bw-timer">
            <span className="bw-timer__clock bw-mono">{formatClock(remainingSec)}</span>
            <span className="bw-timer__label">remaining</span>
          </div>
        ) : null}

        <Button variant="outline" size="sm" disabled={!open || busy} onClick={onEndRound}>
          End round
        </Button>
        {nextRound ? (
          <Button
            variant="accent"
            size="sm"
            disabled={open || busy}
            title={open ? "End this round first." : undefined}
            onClick={onLaunchNext}
          >
            Launch {roundLabel(workspace, nextRound.roundId)} -&gt;
          </Button>
        ) : null}
      </header>

      <div className="bw-body">
        <aside className="bw-rail bw-rail--left">
          <SectionLabel>Session plan</SectionLabel>
          {workspace.rounds.map((meta) => (
            <Card
              key={meta.roundId}
              tone={meta.roundId === live.round?.roundId ? "default" : "sunken"}
              className="bw-plan-row"
            >
              <StatusDot color={meta.dot} />
              <span className="bw-member-name">{roundLabel(workspace, meta.roundId)}</span>
              <span className="bw-mono" style={{ fontSize: 11, color: "var(--bw-ink)" }}>
                {meta.status === "closed" ? "✓" : formatClock(meta.durationSec)}
              </span>
            </Card>
          ))}

          <SectionLabel>Rooms</SectionLabel>
          {round.rooms.map((room) => (
            <div className="bw-rail-row" key={room.id}>
              <StatusDot color={room.dot} />
              <span className="bw-member-name">{room.name}</span>
              <span className="bw-mono" style={{ fontSize: 11 }}>
                {membersOf(room.id).length}/{room.participantUUIDs.length}
              </span>
            </div>
          ))}
        </aside>

        <main className="bw-main">
          <div className="bw-room-grid">
            {round.rooms.map((room) => {
              const members = membersOf(room.id);
              return (
                <Card className="bw-room-card" key={room.id}>
                  <div className="bw-room-card__header">
                    <StatusDot color={room.dot} />
                    <span className="bw-room-name" title={room.name}>{room.name}</span>
                    <div style={{ flex: 1 }} />
                    <Pill tone="outline">{members.length} / {room.participantUUIDs.length}</Pill>
                  </div>
                  {members.map((p) => (
                    <MemberRow key={p.participantUUID} participant={p} />
                  ))}
                  {members.length === 0 ? (
                    <span style={{ fontSize: 11.5, color: "var(--bw-muted-3)" }}>
                      {open ? "Nobody here yet" : "Round closed"}
                    </span>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

function MemberRow({ participant }: { participant: LiveParticipant }) {
  return (
    <div className="bw-member-row">
      <span className="bw-avatar">{initialsFrom(participant.name)}</span>
      <span className="bw-member-name">{participant.name}</span>
    </div>
  );
}
