import { SectionLabel } from "../ui";

/**
 * Temporary participant screen for slice 1.
 *
 * It carries no room controls at all: no room stepper, no auto-assign and no
 * open-rooms button. Hiding the controls is not a styling choice, it is the
 * gate. Slice 7 replaces this with the real participant view.
 */
export default function ParticipantScreen({
  screenName,
  meetingUUID,
}: {
  screenName: string;
  meetingUUID: string;
}) {
  return (
    <div
      className="bw-shell"
      style={{ alignItems: "center", justifyContent: "center", display: "flex" }}
    >
      <div
        className="bw-card bw-card--lg"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 9,
          maxWidth: 340,
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <SectionLabel>Participant</SectionLabel>

        <span style={{ fontSize: 15, fontWeight: 600 }}>
          {screenName ? `You are in, ${screenName}` : "You are in the meeting"}
        </span>

        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--bw-muted-2)" }}>
          The host arranges the breakout rooms. This screen updates on its own if
          the host makes you a co-host.
        </span>

        <span
          className="bw-mono"
          style={{ fontSize: 10, color: "var(--bw-muted-4)", overflowWrap: "anywhere" }}
        >
          {meetingUUID || "no meeting uuid yet"}
        </span>
      </div>
    </div>
  );
}
