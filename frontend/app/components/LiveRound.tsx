"use client";

import { initialsFrom } from "@/lib/participant-status";
import type { LiveOperationState } from "@/lib/use-live-room-controller";
import type { LiveParticipant, LiveState, RoundPlanDraft } from "@/types/breakout";

import { Button, Card, Pill, SectionLabel, StatusDot } from "./ui";

/**
 * Live view of one round, fed by the backend SSE stream. Room names and dots
 * come from the draft; who is where comes from Zoom webhooks via LiveState.
 */
export default function LiveRound({
  round,
  live,
  connected,
  operation,
  onShowDraft,
  onLaunch,
  onClose,
}: {
  round: RoundPlanDraft;
  live: LiveState | null;
  connected: boolean;
  operation: LiveOperationState;
  onShowDraft: () => void;
  onLaunch: () => void;
  onClose: () => void;
}) {
  const busy = operation.kind === "running";
  const launched = live?.round?.roundId === round.roundId;
  const participants = live?.participants ?? [];

  function membersOf(roomId: string): LiveParticipant[] {
    const uuid = live?.round?.roomUUIDs[roomId];
    return uuid ? participants.filter((p) => p.location === uuid) : [];
  }
  const inMain = participants.filter((p) => p.location === "main");
  const left = participants.filter((p) => p.location === "left");

  return (
    <div className="bw-shell">
      <header className="bw-header bw-live-header">
        <span className="bw-brand-mark">B</span>
        <div className="bw-round-heading">
          <span style={{ fontSize: 15, fontWeight: 600 }}>{round.title} · live</span>
          <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
            {connected ? "Receiving Zoom updates" : "Reconnecting…"}
          </span>
        </div>
        <div className="bw-header-spacer" />
        <Button variant="outline" size="sm" onClick={onShowDraft}>Draft plan</Button>
        {launched ? (
          <Button size="sm" onClick={onClose} disabled={busy}>Close {round.title}</Button>
        ) : (
          <Button variant="accent" size="sm" onClick={onLaunch} disabled={busy}>Launch {round.title}</Button>
        )}
      </header>

      <div className="bw-body">
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
                      {launched ? "Nobody here yet" : "Round not open"}
                    </span>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </main>

        <aside className="bw-rail">
          <div className="bw-section-heading">
            <SectionLabel>Round</SectionLabel>
            <Pill tone={launched ? "teal" : "neutral"}>{launched ? "open" : "not open"}</Pill>
          </div>

          {operation.kind !== "idle" ? (
            <Card className={`bw-operation bw-operation--${operation.kind}`}>
              <SectionLabel>
                {operation.kind === "running" ? operation.operation : operation.kind}
              </SectionLabel>
              <span>{operation.kind === "running" ? operation.step : operation.message}</span>
            </Card>
          ) : null}

          <div className="bw-placement-rail">
            <div className="bw-section-heading">
              <SectionLabel>In main meeting</SectionLabel>
              <Pill tone="outline">{inMain.length}</Pill>
            </div>
            {inMain.map((p) => (
              <MemberRow key={p.participantUUID} participant={p} rail />
            ))}
          </div>

          {left.length > 0 ? (
            <div className="bw-placement-rail">
              <div className="bw-section-heading">
                <SectionLabel>Left meeting</SectionLabel>
                <Pill tone="outline">{left.length}</Pill>
              </div>
              {left.map((p) => (
                <MemberRow key={p.participantUUID} participant={p} rail />
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function MemberRow({ participant, rail }: { participant: LiveParticipant; rail?: boolean }) {
  return (
    <div className={rail ? "bw-rail-row" : "bw-member-row"}>
      <span className={rail ? "bw-avatar bw-avatar--rail" : "bw-avatar"}>
        {initialsFrom(participant.name)}
      </span>
      <span className="bw-member-name">{participant.name}</span>
    </div>
  );
}
