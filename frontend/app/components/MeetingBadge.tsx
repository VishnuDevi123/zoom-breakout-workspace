import type { SessionState } from "@/types/breakout";

import { SectionLabel } from "./ui";

/**
 * Small meeting readout for the rail. This used to live inside ZoomClient, but
 * ZoomClient now owns the host gate for the whole page, so the readout was
 * split out and made presentational. It renders props only and talks to nothing.
 */
export default function MeetingBadge({
  meetingUUID,
  sessionState,
  role,
}: {
  meetingUUID: string;
  sessionState: SessionState | null;
  /** Shown so a co-host can tell at a glance why they have host controls. */
  role?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <SectionLabel>Meeting</SectionLabel>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          className="bw-mono"
          style={{
            fontSize: 10,
            color: "var(--bw-muted-3)",
            overflowWrap: "anywhere",
          }}
        >
          {meetingUUID || "no meeting uuid yet"}
        </span>

        {sessionState && (
          <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
            Session {sessionState}
          </span>
        )}

        {role && (
          <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
            Joined as {role}
          </span>
        )}
      </div>
    </div>
  );
}
