"use client";

import { useRef, useState } from "react";

import { STATUS_LABEL } from "@/lib/participant-status";
import type { Participant, PlannedRoom } from "@/types/breakout";

import { Button, Card, StatusDot } from "./ui";

/** Editable planned-room card. Members come only from draft assignment IDs. */
export default function RoomCard({
  room,
  participants,
  canRemove,
  onRename,
  onRemove,
}: {
  room: PlannedRoom;
  participants: Participant[];
  canRemove: boolean;
  onRename: (name: string) => string | null;
  onRemove: () => void;
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
            <details className="bw-room-menu">
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
        {participants.map((participant) => (
          <div className="bw-member-row" key={participant.participantUUID}>
            <span className="bw-avatar">{participant.initials}</span>
            <span className="bw-member-name">
              {participant.displayName}{participant.isHost ? " · host" : ""}
            </span>
            <span style={{ fontSize: 10, color: "var(--bw-muted-4)" }}>
              {STATUS_LABEL[participant.status]}
            </span>
          </div>
        ))}

        {participants.length === 0 ? (
          <span style={{ fontSize: 11.5, color: "var(--bw-muted-3)" }}>
            Nobody planned here yet
          </span>
        ) : null}

        {participants.length < room.participantUUIDs.length ? (
          <span style={{ fontSize: 10.5, color: "var(--bw-muted-2)" }}>
            {room.participantUUIDs.length - participants.length} planned participant
            {room.participantUUIDs.length - participants.length === 1 ? " is" : "s are"} not in live roster
          </span>
        ) : null}
      </div>
    </Card>
  );
}
