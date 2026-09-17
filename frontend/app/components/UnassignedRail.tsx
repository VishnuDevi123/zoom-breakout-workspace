import type { ReactNode } from "react";

import { STATUS_LABEL, type Participant } from "@/lib/participant-status";
import type { PlannedRoom } from "@/types/breakout";

import { Pill, SectionLabel } from "./ui";

interface AssignmentCallbacks {
  onAssignParticipant: (assignment: { participantUUID: string; roomId: string }) => void;
  onUnassignParticipant: (participantUUID: string) => void;
  onKeepParticipantInMain: (participantUUID: string) => void;
}

interface UnassignedRailProps extends AssignmentCallbacks {
  participants: Participant[];
  stayingInMain: Participant[];
  rooms: PlannedRoom[];
  currentRosterIds: Set<string>;
  rosterKnown: boolean;
}

/** Draft-unplaced people and explicit stay-in-main intent, separate from Zoom rooms. */
export default function UnassignedRail({
  participants,
  stayingInMain,
  rooms,
  currentRosterIds,
  rosterKnown,
  onAssignParticipant,
  onUnassignParticipant,
  onKeepParticipantInMain,
}: UnassignedRailProps) {
  return (
    <div className="bw-placement-rail">
      <div className="bw-section-heading">
        <SectionLabel>Not yet placed</SectionLabel>
        <Pill tone="amber">{participants.length}</Pill>
      </div>

      {participants.map((participant) => (
        <ParticipantRailRow
          key={participant.participantUUID}
          participant={participant}
          status={rosterKnown ? STATUS_LABEL[participant.status] : "roster unverified"}
        >
          <PlacementSelect
            participant={participant}
            rooms={rooms}
            disabled={!rosterKnown || !participant.assignmentEligible}
            onAssignParticipant={onAssignParticipant}
            onKeepParticipantInMain={onKeepParticipantInMain}
            onUnassignParticipant={onUnassignParticipant}
          />
        </ParticipantRailRow>
      ))}

      {participants.length === 0 ? (
        <div className="bw-empty-placement">
          {rosterKnown
            ? "Everyone in the live roster has a draft placement."
            : "Roster unavailable. Last known placements remain saved."}
        </div>
      ) : null}

      {stayingInMain.length > 0 ? (
        <div className="bw-stay-main">
          <div className="bw-section-heading">
            <SectionLabel>Staying in main</SectionLabel>
            <Pill tone="neutral">{stayingInMain.length}</Pill>
          </div>
          {stayingInMain.map((participant) => {
            const isAvailable = currentRosterIds.has(participant.participantUUID);
            const status = rosterKnown
              ? isAvailable
                ? "planned"
                : "unavailable"
              : "roster unverified";

            return (
              <ParticipantRailRow
                key={participant.participantUUID}
                participant={participant}
                status={status}
                unavailable={rosterKnown && !isAvailable}
              >
                <PlacementSelect
                  participant={participant}
                  rooms={rooms}
                  includeUnassign
                  onAssignParticipant={onAssignParticipant}
                  onKeepParticipantInMain={onKeepParticipantInMain}
                  onUnassignParticipant={onUnassignParticipant}
                />
              </ParticipantRailRow>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ParticipantRailRow({
  participant,
  status,
  unavailable = false,
  children,
}: {
  participant: Participant;
  status: string;
  unavailable?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`bw-rail-row${unavailable ? " bw-rail-row--unavailable" : ""}`}>
      <span className="bw-avatar bw-avatar--rail">{participant.initials}</span>
      <span className="bw-rail-person">
        <span title={participant.displayName}>
          {participant.displayName}{participant.isHost ? " · host" : ""}
        </span>
        <span>{status}</span>
      </span>
      {children}
    </div>
  );
}

function PlacementSelect({
  participant,
  rooms,
  includeUnassign = false,
  disabled = false,
  onAssignParticipant,
  onUnassignParticipant,
  onKeepParticipantInMain,
}: {
  participant: Participant;
  rooms: PlannedRoom[];
  includeUnassign?: boolean;
  disabled?: boolean;
} & AssignmentCallbacks) {
  return (
    <select
      className="bw-placement-select"
      value=""
      aria-label={`Choose placement for ${participant.displayName}`}
      disabled={disabled}
      title={
        disabled
          ? participant.assignmentEligible
            ? "Refresh the live roster before changing this placement."
            : "Zoom did not provide a stable participant identifier."
          : undefined
      }
      onChange={(event) => {
        const destination = event.target.value;
        if (!destination) return;
        if (destination === "stay-in-main") {
          onKeepParticipantInMain(participant.participantUUID);
          return;
        }
        if (destination === "unassign") {
          onUnassignParticipant(participant.participantUUID);
          return;
        }
        onAssignParticipant({
          participantUUID: participant.participantUUID,
          roomId: destination,
        });
      }}
    >
      <option value="">Assign…</option>
      {rooms.map((room) => (
        <option key={room.id} value={room.id}>{room.name}</option>
      ))}
      {includeUnassign ? <option value="unassign">Not yet placed</option> : null}
      {!includeUnassign ? <option value="stay-in-main">Stay in main</option> : null}
    </select>
  );
}
