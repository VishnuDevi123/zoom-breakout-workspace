import { SectionLabel } from "./ui";

/**
 * Small meeting readout for the rail. This used to live inside ZoomClient, but
 * ZoomClient now owns the host gate for the whole page, so the readout was
 * split out and made presentational. It renders props only and talks to nothing.
 */
export default function MeetingBadge({
  meetingUUID,
  role,
}: {
  meetingUUID: string;
  /** Shown so a co-host can tell at a glance why they have host controls. */
  role?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      </div>
    </div>
  );
}
