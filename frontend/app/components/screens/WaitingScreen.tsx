import { SectionLabel } from "../ui";

/** A full page that says what this person is waiting for. Shared by participants and co-hosts. */
export default function WaitingScreen({
  label = "Breakout Workspace",
  headline,
  lede,
  children,
}: {
  label?: string;
  headline: string;
  lede: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bw-shell">
      <div className="bw-body">
        <main className="bw-main bw-participant-main">
          <SectionLabel>{label}</SectionLabel>
          <h2 className="bw-landing-title">{headline}</h2>
          <p className="bw-landing-lede">{lede}</p>
          {children}
        </main>
      </div>
    </div>
  );
}
