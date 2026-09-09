import { SectionLabel } from "../ui";

/**
 * First of the four gate states. It is shown between mount and the moment
 * getUserContext() resolves. It exists as a real screen rather than a blank
 * page so a slow Zoom client never looks like a broken app.
 */
export default function CheckingScreen() {
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
          gap: 8,
          maxWidth: 320,
          textAlign: "center",
          alignItems: "center",
        }}
      >
        <SectionLabel>Checking</SectionLabel>

        <span style={{ fontSize: 15, fontWeight: 600 }}>Reading your role</span>

        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--bw-muted-2)" }}>
          Asking Zoom whether you can manage breakout rooms in this meeting.
        </span>
      </div>
    </div>
  );
}
