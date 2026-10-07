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

        <span className="bw-header-title">Checking your role</span>
      </div>
    </div>
  );
}
