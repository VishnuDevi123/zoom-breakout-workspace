"use client";

import { useState, type ReactNode } from "react";

import type { DraftSaveState } from "@/lib/use-room-plan";
import type { Participant, Room, RoundPlanDraft } from "@/types/breakout";

import RoomCard from "./RoomCard";
import UnassignedRail from "./UnassignedRail";
import { Button, Card, Pill, SectionLabel } from "./ui";

export interface RoomsProps {
  round: RoundPlanDraft;
  roster: Participant[];
  liveRooms?: Room[];
  save: DraftSaveState;
  canAdd: boolean;
  isRefreshing: boolean;
  rosterError?: string;
  onAddRoom: () => void;
  onRemoveRoom: (roomId: string) => void;
  onRenameRoom: (roomId: string, name: string) => string | null;
  onRefresh: () => void;
  onRetrySave: () => void;
  onReloadDraft?: () => void;
  onImportLiveRooms?: (rooms: Room[]) => string | null;
  onBeforeNavigate?: () => Promise<boolean>;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  headerActions?: ReactNode;
  railFooter?: ReactNode;
}

/** Reusable editor for one selected round. All mutations are draft callbacks. */
export default function Rooms({
  round,
  roster,
  liveRooms = [],
  save,
  canAdd,
  isRefreshing,
  rosterError,
  onAddRoom,
  onRemoveRoom,
  onRenameRoom,
  onRefresh,
  onRetrySave,
  onReloadDraft,
  onImportLiveRooms,
  onBeforeNavigate,
  onBack,
  onNext,
  nextLabel = "Next",
  headerActions,
  railFooter,
}: RoomsProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const rosterById = new Map(roster.map((participant) => [participant.participantUUID, participant]));
  const assignedIds = new Set(round.rooms.flatMap((room) => room.participantUUIDs));
  const unassigned = roster.filter((participant) => !assignedIds.has(participant.participantUUID));
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

  function importRooms() {
    const assignments = round.rooms.reduce(
      (total, room) => total + room.participantUUIDs.length,
      0,
    );
    const assignmentText = assignments
      ? ` ${assignments} planned participant assignment${assignments === 1 ? "" : "s"} will be cleared.`
      : "";
    if (
      !window.confirm(
        `Replace ${round.title}'s ${round.rooms.length} draft room${round.rooms.length === 1 ? "" : "s"} with ${liveRooms.length} current Zoom room${liveRooms.length === 1 ? "" : "s"}?${assignmentText} Zoom will not change.`,
      )
    ) {
      return;
    }
    setImportError(onImportLiveRooms?.(liveRooms) ?? null);
  }

  async function navigate(callback: (() => void) | undefined) {
    if (!callback) return;
    if (onBeforeNavigate && !(await onBeforeNavigate())) return;
    callback();
  }

  return (
    <div className="bw-shell">
      <header className="bw-header">
        <span className="bw-brand-mark">B</span>
        <div className="bw-round-heading">
          <span style={{ fontSize: 15, fontWeight: 600 }}>Rooms &amp; people — {round.title}</span>
          <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
            Draft plan · changes save automatically
          </span>
        </div>
        <div className="bw-header-spacer" />

        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? "Refreshing…" : "Refresh live roster"}
        </Button>

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
          <button type="button" aria-label="Add room" onClick={onAddRoom} disabled={!canAdd}>
            +
          </button>
        </div>

        {headerActions}
      </header>

      <div className="bw-body">
        <main className="bw-main">
          {onImportLiveRooms && liveRooms.length > 0 ? (
            <Card tone="sunken" className="bw-import-banner">
              <div>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>
                  Current Zoom rooms available
                </span>
                <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
                  Import room names and order into this draft. Live assignments are not copied.
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={importRooms}>
                Use current Zoom rooms
              </Button>
            </Card>
          ) : null}

          {importError ? (
            <Card tone="dashed" className="bw-field-error" role="alert">
              {importError}
            </Card>
          ) : null}

          <div className="bw-room-grid">
            {round.rooms.map((room) => {
              const participants = room.participantUUIDs.flatMap((id) => {
                const participant = rosterById.get(id);
                return participant ? [participant] : [];
              });
              return (
                <RoomCard
                  key={room.id}
                  room={room}
                  participants={participants}
                  canRemove={round.rooms.length > 1}
                  onRename={(name) => onRenameRoom(room.id, name)}
                  onRemove={() => remove(room.id)}
                />
              );
            })}
          </div>
        </main>

        <aside className="bw-rail">
          <SaveFeedback save={save} onRetry={onRetrySave} onReload={onReloadDraft} />
          <UnassignedRail participants={unassigned} />

          {rosterError ? (
            <Card tone="dashed" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--bw-muted-2)", lineHeight: 1.45 }}>
                Live roster read failed. Draft assignments remain unchanged; this list may be incomplete.
              </span>
              <span className="bw-mono" style={{ fontSize: 10, color: "var(--bw-muted-4)" }}>
                {rosterError}
              </span>
            </Card>
          ) : null}

          {railFooter}

          {onBack || onNext ? (
            <div className="bw-navigation">
              {onBack ? (
                <Button variant="outline" onClick={() => void navigate(onBack)}>Back</Button>
              ) : null}
              {onNext ? (
                <Button onClick={() => void navigate(onNext)}>{nextLabel}</Button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
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
