"use client";

import type { ReactNode } from "react";

import { useDismissibleMenus } from "@/lib/use-dismissible-menus";
import type { DraftSaveState } from "@/lib/use-room-plan";
import type { Participant } from "@/lib/participant-status";
import type { RoundPlanDraft } from "@/types/breakout";

import RoomCard from "./RoomCard";
import UnassignedRail from "./UnassignedRail";
import { BrandMark, Button, Card, Pill, SectionLabel } from "./ui";

export interface RoomsProps {
  round: RoundPlanDraft;
  roster: Participant[];
  rosterKnown: boolean;
  save: DraftSaveState;
  canAdd: boolean;
  onAddRoom: () => void;
  onRemoveRoom: (roomId: string) => void;
  onRenameRoom: (roomId: string, name: string) => string | null;
  onAssignParticipant: (assignment: { participantUUID: string; roomId: string }) => void;
  onUnassignParticipant: (participantUUID: string) => void;
  onKeepParticipantInMain: (participantUUID: string) => void;
  onAutoAssign: (participantUUIDs: string[]) => void;
  onRetrySave: () => void;
  onReloadDraft?: () => void;
  onBeforeNavigate?: () => Promise<boolean>;
  onBack?: () => void;
  backLabel?: string;
  onHome?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  railFooter?: ReactNode;
}

/** Reusable editor for one selected round. All mutations are draft callbacks. */
export default function Rooms({
  round,
  roster,
  rosterKnown,
  save,
  canAdd,
  onAddRoom,
  onRemoveRoom,
  onRenameRoom,
  onAssignParticipant,
  onUnassignParticipant,
  onKeepParticipantInMain,
  onAutoAssign,
  onRetrySave,
  onReloadDraft,
  onBeforeNavigate,
  onBack,
  backLabel = "Back",
  onHome,
  onNext,
  nextLabel = "Next",
  railFooter,
}: RoomsProps) {
  const menuRootRef = useDismissibleMenus();
  const rosterById = new Map(
    roster.map((participant) => [participant.participantUUID, participant]),
  );
  const currentRosterIds = new Set(
    roster.map((participant) => participant.participantUUID),
  );
  const assignedIds = new Set(round.rooms.flatMap((room) => room.participantUUIDs));
  const stayInMainIds = new Set(round.stayInMainParticipantUUIDs ?? []);
  const unassigned = roster.filter(
    (participant) =>
      !assignedIds.has(participant.participantUUID) &&
      !stayInMainIds.has(participant.participantUUID),
  );
  const stayingInMain = [...stayInMainIds].map(
    (participantUUID) => rosterById.get(participantUUID) ?? unavailableParticipant(participantUUID),
  );
  const eligibleForAutoAssign = rosterKnown
    ? unassigned.filter(
        (participant) => participant.assignmentEligible && !participant.isHost,
      )
    : [];
  const autoAssignDisabledReason = !rosterKnown
    ? "Waiting for live roster."
    : eligibleForAutoAssign.length === 0
      ? "No eligible unassigned attendees remain."
      : null;
  const lastRoom = round.rooms.at(-1);

  function remove(roomId: string) {
    const room = round.rooms.find((candidate) => candidate.id === roomId);
    if (!room || round.rooms.length <= 1) return;
    if (
      room.participantUUIDs.length > 0 &&
      !window.confirm(
        `Remove ${room.name}? ${room.participantUUIDs.length} planned participant${room.participantUUIDs.length === 1 ? "" : "s"} will become unassigned.`,
      )
    ) {
      return;
    }
    onRemoveRoom(room.id);
  }

  async function navigate(callback: (() => void) | undefined) {
    if (!callback) return;
    if (onBeforeNavigate && !(await onBeforeNavigate())) return;
    callback();
  }

  return (
    <div ref={menuRootRef} className="bw-shell">
      <header className="bw-header">
        <BrandMark onHome={onHome ? () => void navigate(onHome) : undefined} />
        <div className="bw-round-heading">
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            Rooms &amp; people - {round.title}
          </span>
        </div>
        <div className="bw-header-spacer" />

        <div className="bw-stepper">
          <button
            type="button"
            aria-label={lastRoom ? `Remove ${lastRoom.name}` : "Remove room"}
            title={lastRoom ? `Remove ${lastRoom.name}` : undefined}
            onClick={() => lastRoom && remove(lastRoom.id)}
            disabled={round.rooms.length <= 1}
          >
            −
          </button>
          <span className="bw-room-count">{round.rooms.length} rooms</span>
          <button
            type="button"
            aria-label="Add room"
            onClick={onAddRoom}
            disabled={!canAdd}
          >
            +
          </button>
        </div>

        <div className="bw-auto-assign relative group inline-block">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onAutoAssign(
                eligibleForAutoAssign.map(
                  (participant) => participant.participantUUID,
                ),
              )
            }
            disabled={Boolean(autoAssignDisabledReason)}
            title={autoAssignDisabledReason || undefined}
          >
            Auto-assign evenly
          </Button>
        </div>
      </header>

      <div className="bw-body">
        <main className="bw-main">
          <div className="bw-room-grid">
            {round.rooms.map((room) => {
              const participants = room.participantUUIDs.map(
                (participantUUID) =>
                  rosterById.get(participantUUID) ??
                  unavailableParticipant(participantUUID),
              );
              return (
                <RoomCard
                  key={room.id}
                  room={room}
                  participants={participants}
                  rooms={round.rooms}
                  unassignedParticipants={
                    rosterKnown
                      ? unassigned.filter(
                          (participant) => participant.assignmentEligible,
                        )
                      : []
                  }
                  currentRosterIds={currentRosterIds}
                  rosterKnown={rosterKnown}
                  canRemove={round.rooms.length > 1}
                  onRename={(name) => onRenameRoom(room.id, name)}
                  onRemove={() => remove(room.id)}
                  onAssignParticipant={onAssignParticipant}
                  onUnassignParticipant={onUnassignParticipant}
                  onKeepParticipantInMain={onKeepParticipantInMain}
                />
              );
            })}
          </div>
        </main>

        <aside className="bw-rail">
          <SaveFeedback
            save={save}
            onRetry={onRetrySave}
            onReload={onReloadDraft}
          />
          <UnassignedRail
            participants={unassigned}
            stayingInMain={stayingInMain}
            rooms={round.rooms}
            currentRosterIds={currentRosterIds}
            rosterKnown={rosterKnown}
            onAssignParticipant={onAssignParticipant}
            onUnassignParticipant={onUnassignParticipant}
            onKeepParticipantInMain={onKeepParticipantInMain}
          />

          {railFooter}

          {onBack || onNext ? (
            <div className="bw-navigation">
              {onBack ? (
                <Button variant="outline" onClick={() => void navigate(onBack)}>
                  {backLabel}
                </Button>
              ) : null}
              {onNext ? (
                <Button onClick={() => void navigate(onNext)}>
                  {nextLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function unavailableParticipant(participantUUID: string): Participant {
  return {
    participantUUID,
    assignmentEligible: true,
    displayName: "Unavailable participant",
    initials: "?",
    status: "left",
    roomId: null,
    isHost: false,
  };
}

function SaveFeedback({
  save,
  onRetry,
  onReload,
}: {
  save: DraftSaveState;
  onRetry: () => void;
  onReload?: () => void;
}) {
  if (save.kind === "saving") return <Pill tone="neutral">Saving…</Pill>;
  if (save.kind === "saved") return <Pill tone="teal">Saved</Pill>;

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <SectionLabel>Save failed</SectionLabel>
        <Pill tone="red">{save.conflict ? "Conflict" : "Not saved"}</Pill>
      </div>
      <span style={{ fontSize: 11, lineHeight: 1.45, color: "var(--bw-muted-2)" }}>
        {save.message} {save.conflict ? "Retry keeps your local draft." : ""}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry save</Button>
        {save.conflict && onReload ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm("Discard local draft edits and reload the server version?")) {
                onReload();
              }
            }}
          >
            Reload server draft
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
