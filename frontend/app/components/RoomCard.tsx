"use client";

import { useRef, useState } from "react";

import { DRAFT_MEMBER_STATUS_LABEL, type Participant } from "@/lib/participant-status";
import type { PlannedRoom } from "@/types/breakout";

import { Button, Card, StatusDot } from "./ui";

/** Editable planned-room card. Members come only from draft assignment IDs. */
export default function RoomCard({
  room,
  participants,
  rooms,
  unassignedParticipants,
  currentRosterIds,
  rosterKnown,
  canRemove,
  onRename,
  onRemove,
  onAssignParticipant,
  onUnassignParticipant,
  onKeepParticipantInMain,
}: {
  room: PlannedRoom;
  participants: Participant[];
  rooms: PlannedRoom[];
  unassignedParticipants: Participant[];
  currentRosterIds: Set<string>;
  rosterKnown: boolean;
  canRemove: boolean;
  onRename: (name: string) => string | null;
  onRemove: () => void;
  onAssignParticipant: (assignment: { participantUUID: string; roomId: string }) => void;
  onUnassignParticipant: (participantUUID: string) => void;
  onKeepParticipantInMain: (participantUUID: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [error, setError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  function finishEditing() {
    const validationError = onRename(name);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsEditing(false);
    setError(null);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  function cancelEditing() {
    setName(room.name);
    setError(null);
    setIsEditing(false);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  return (
    <Card className="bw-room-card">
      <div className="bw-room-card__header">
        <StatusDot color={room.dot} />

        {isEditing ? (
          <>
            <input
              autoFocus
              className="bw-room-name-input"
              value={name}
              aria-label={`New name for ${room.name}`}
              aria-invalid={Boolean(error)}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishEditing();
                if (event.key === "Escape") cancelEditing();
              }}
            />
            <Button size="sm" onClick={finishEditing}>Save</Button>
            <Button variant="outline" size="sm" onClick={cancelEditing} aria-label="Cancel rename">
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className="bw-room-name">{room.name}</span>
            <button
              ref={editButtonRef}
              type="button"
              className="bw-icon-button"
              aria-label={`Rename ${room.name}`}
              title="Rename room"
              onClick={() => {
                setName(room.name);
                setIsEditing(true);
              }}
            >
              ✎
            </button>
            <div style={{ flex: 1 }} />
            <span className="bw-mono" style={{ fontSize: 10, color: "var(--bw-muted-3)" }}>
              {room.participantUUIDs.length}
            </span>
            <details className="bw-room-menu" data-dismissible-menu>
              <summary className="bw-icon-button" aria-label={`Menu for ${room.name}`}>⋮</summary>
              <div className="bw-room-menu__popover">
                <button type="button" disabled={!canRemove} onClick={onRemove}>
                  Remove room
                </button>
              </div>
            </details>
          </>
        )}
      </div>

      {error ? <span className="bw-field-error" role="alert">{error}</span> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {participants.map((participant) => {
          const isAvailable = currentRosterIds.has(participant.participantUUID);
          const status = rosterKnown
            ? isAvailable
              ? DRAFT_MEMBER_STATUS_LABEL[participant.status]
              : "unavailable"
            : "roster unverified";

          return (
            <div
              className={`bw-member-row${isAvailable || !rosterKnown ? "" : " bw-member-row--unavailable"}`}
              key={participant.participantUUID}
            >
              <span className="bw-avatar">{participant.initials}</span>
              <span className="bw-member-name" title={participant.displayName}>
                {participant.displayName}{participant.isHost ? " · host" : ""}
              </span>
              <span className="bw-member-status" title={status}>{status}</span>
              <MemberMenu
                participant={participant}
                currentRoomId={room.id}
                rooms={rooms}
                onAssignParticipant={onAssignParticipant}
                onUnassignParticipant={onUnassignParticipant}
                onKeepParticipantInMain={onKeepParticipantInMain}
              />
            </div>
          );
        })}

        {participants.length === 0 ? (
          <span style={{ fontSize: 11.5, color: "var(--bw-muted-3)" }}>
            Nobody planned here yet
          </span>
        ) : null}

      </div>

      {unassignedParticipants.length > 0 ? (
        <details className="bw-add-person-menu" data-dismissible-menu>
          <summary>+ Add person</summary>
          <div className="bw-add-person-menu__popover">
            {unassignedParticipants.map((participant) => (
              <button
                type="button"
                key={participant.participantUUID}
                onClick={() =>
                  onAssignParticipant({
                    participantUUID: participant.participantUUID,
                    roomId: room.id,
                  })
                }
              >
                <span className="bw-avatar">{participant.initials}</span>
                <span>{participant.displayName}{participant.isHost ? " · host" : ""}</span>
              </button>
            ))}
          </div>
        </details>
      ) : (
        <button
          type="button"
          className="bw-add-person-button"
          disabled
          title={
            rosterKnown
              ? "No assignable participant is waiting for a room."
              : "Refresh the live roster first."
          }
        >
          + Add person
        </button>
      )}
    </Card>
  );
}

function MemberMenu({
  participant,
  currentRoomId,
  rooms,
  onAssignParticipant,
  onUnassignParticipant,
  onKeepParticipantInMain,
}: {
  participant: Participant;
  currentRoomId: string;
  rooms: PlannedRoom[];
  onAssignParticipant: (assignment: { participantUUID: string; roomId: string }) => void;
  onUnassignParticipant: (participantUUID: string) => void;
  onKeepParticipantInMain: (participantUUID: string) => void;
}) {
  const otherRooms = rooms.filter((room) => room.id !== currentRoomId);

  return (
    <details className="bw-member-menu" data-dismissible-menu>
      <summary
        className="bw-icon-button"
        aria-label={`Placement options for ${participant.displayName}`}
      >
        ⋮
      </summary>
      <div className="bw-member-menu__popover">
        {otherRooms.length > 0 ? (
          <span className="bw-menu-label">Move to room</span>
        ) : null}
        {otherRooms.map((targetRoom) => (
          <button
            type="button"
            key={targetRoom.id}
            onClick={() =>
              onAssignParticipant({
                participantUUID: participant.participantUUID,
                roomId: targetRoom.id,
              })
            }
          >
            {targetRoom.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onUnassignParticipant(participant.participantUUID)}
        >
          Unassign
        </button>
        <button
          type="button"
          onClick={() => onKeepParticipantInMain(participant.participantUUID)}
        >
          Keep in main
        </button>
      </div>
    </details>
  );
}
