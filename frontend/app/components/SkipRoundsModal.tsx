"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { roundLabel } from "@/lib/use-workspace";
import type { RoundMeta, Workspace } from "@/types/breakout";

import { Button, SectionLabel, StatusDot } from "./ui";

/**
 * Choosing which of the remaining rounds to leave out, from the live screen.
 *
 * Skipping is a decision made while running a session, not while planning one,
 * so it lives here rather than on the rounds overview. The running round is not
 * listed: End round already covers it.
 *
 * The backend does not police which rounds may change, so this panel is the
 * guard - a launched or closed round is shown but cannot be toggled.
 */
export default function SkipRoundsModal({
  workspace,
  liveRoundId,
  onSkipRound,
  onClose,
}: {
  workspace: Workspace;
  liveRoundId: string | null;
  onSkipRound: (roundId: string, skipped: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const liveIndex = workspace.rounds.findIndex((round) => round.roundId === liveRoundId);
  const upcoming = workspace.rounds.slice(liveIndex + 1);

  async function toggle(round: RoundMeta) {
    setPending(round.roundId);
    try {
      await onSkipRound(round.roundId, round.status !== "skipped");
    } catch (error) {
      toast.error("Could not change that round.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      className="bw-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Skip rounds"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bw-overlay__panel">
        <header className="bw-overlay__header">
          <div className="bw-round-heading">
            <span style={{ fontSize: 15, fontWeight: 600 }}>Skip rounds</span>
            <SectionLabel>Skipped rounds are passed over when this round ends</SectionLabel>
          </div>
          <div className="bw-header-spacer" />
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </header>

        <div className="bw-overlay__body">
          {upcoming.length === 0 ? (
            <span style={{ fontSize: 11.5, color: "var(--bw-muted-2)" }}>
              Nothing after this round. Add another round to plan further ahead.
            </span>
          ) : (
            upcoming.map((round) => (
              <SkipRow
                key={round.roundId}
                round={round}
                label={roundLabel(workspace, round.roundId)}
                busy={pending === round.roundId}
                onToggle={() => void toggle(round)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SkipRow({
  round,
  label,
  busy,
  onToggle,
}: {
  round: RoundMeta;
  label: string;
  busy: boolean;
  onToggle: () => void;
}) {
  const skipped = round.status === "skipped";
  // A round that already ran, or is running, is not the host's to skip now.
  const settled = round.status === "launched" || round.status === "closed";

  return (
    <div className={skipped ? "bw-skip-row bw-skip-row--skipped" : "bw-skip-row"}>
      <StatusDot color={round.dot} />
      <span className="bw-member-name">{label}</span>
      <div style={{ flex: 1 }} />
      {settled ? (
        <span style={{ fontSize: 11, color: "var(--bw-muted-3)" }}>
          {round.status === "closed" ? "already run" : "running"}
        </span>
      ) : (
        <Button variant={skipped ? "accent" : "outline"} size="sm" disabled={busy} onClick={onToggle}>
          {skipped ? "Put back" : "Skip"}
        </Button>
      )}
    </div>
  );
}
