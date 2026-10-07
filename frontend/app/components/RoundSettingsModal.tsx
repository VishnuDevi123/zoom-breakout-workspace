"use client";

import { useState } from "react";

import { formatClock } from "@/lib/round-clock";
import type { RoundMeta, RoundPlan } from "@/types/breakout";

import { Button, EditableName, Modal, Pill, SectionLabel } from "./ui";

const DURATION_STEP_SEC = 30;
const MIN_DURATION_SEC = 30;

/**
 * One upcoming round, changed from the live page: name, time and whether it is
 * skipped. Its rooms are shown, not edited; people are settled at launch.
 */
export default function RoundSettingsModal({
  round,
  position,
  plan,
  onUpdateRound,
  onSkipRound,
  onClose,
}: {
  round: RoundMeta;
  /** 1-based place in the session, for the "Round N" fallback name. */
  position: number;
  plan: RoundPlan | null;
  onUpdateRound: (roundId: string, patch: Partial<Pick<RoundMeta, "title" | "durationSec">>) => Promise<void>;
  onSkipRound: (roundId: string, skipped: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [skipping, setSkipping] = useState(false);
  const skipped = round.status === "skipped";
  const roomCount = plan?.rooms.length ?? 0;
  const placedCount = plan?.rooms.reduce((sum, room) => sum + room.participantUUIDs.length, 0) ?? 0;

  async function toggleSkipped() {
    setSkipping(true);
    await onSkipRound(round.roundId, !skipped);
    setSkipping(false);
  }

  return (
    <Modal label={`Round ${position} settings`} locked={skipping} onClose={onClose}>
      {(close) => (
        <>
          <header className="bw-overlay__header">
            <EditableName
              value={round.title}
              placeholder={`Round ${position}`}
              className="bw-round-settings__name"
              onSave={(title) => void onUpdateRound(round.roundId, { title })}
            />
            <Pill tone={skipped ? "amber" : "neutral"}>{skipped ? "Skipped" : "Planned"}</Pill>
          </header>

          <div className="bw-overlay__body">
            <div className="bw-field">
              <SectionLabel>Time</SectionLabel>
              <div className="bw-stepper bw-stepper--inline">
                <button
                  type="button"
                  aria-label="Shorter"
                  disabled={round.durationSec <= MIN_DURATION_SEC}
                  onClick={() => void onUpdateRound(round.roundId, { durationSec: round.durationSec - DURATION_STEP_SEC })}
                >
                  −
                </button>
                <span className="bw-room-count bw-mono">{formatClock(round.durationSec)}</span>
                <button
                  type="button"
                  aria-label="Longer"
                  onClick={() => void onUpdateRound(round.roundId, { durationSec: round.durationSec + DURATION_STEP_SEC })}
                >
                  +
                </button>
              </div>
            </div>

            <div className="bw-field">
              <SectionLabel>Rooms</SectionLabel>
              <span className="bw-round-settings__rooms">
                {roomCount === 0
                  ? "No rooms yet"
                  : `${roomCount} ${roomCount === 1 ? "room" : "rooms"} · ${placedCount} ${placedCount === 1 ? "person" : "people"} placed`}
              </span>
            </div>
          </div>

          <footer className="bw-overlay__footer">
            <Button variant="secondary" size="sm" busy={skipping} onClick={() => void toggleSkipped()}>
              {skipped ? "Put this round back" : "Skip this round"}
            </Button>
            <Button size="sm" disabled={skipping} onClick={close}>
              Done
            </Button>
          </footer>
        </>
      )}
    </Modal>
  );
}
