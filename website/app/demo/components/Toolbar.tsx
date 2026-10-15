/** Simple line icons for the toolbar, drawn on a 24px grid. */
const ICONS: Record<string, string> = {
  Mute: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  "Start Video": "M3 7h12v10H3zM15 10l6-3v10l-6-3",
  Participants: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6",
  Chat: "M4 5h16v11H8l-4 4z",
  Share: "M4 5h16v12H4zM12 14V8M9 11l3-3 3 3",
  Reactions: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M8.5 14.5a4 4 0 0 0 7 0",
  Apps: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
};

const LEFT = ["Mute", "Start Video"];
const CENTER = ["Participants", "Chat", "Share", "Reactions"];

function Icon({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[label]} />
    </svg>
  );
}

/** A control that only looks like Zoom's; the demo does not use it. */
function DecorativeItem({ label, badge }: { label: string; badge?: number }) {
  return (
    <span className="dm-tool" aria-hidden="true">
      <Icon label={label} />
      {badge ? <span className="dm-tool__badge">{badge}</span> : null}
      {label}
    </span>
  );
}

/** Zoom-style meeting controls. Only Apps works: it opens Breakout Workspace, as in Zoom. */
export default function Toolbar({
  participantCount,
  appsOpen,
  appsPulse,
  onApps,
}: {
  participantCount: number;
  appsOpen: boolean;
  /** The tour is waiting for the visitor to press Apps. */
  appsPulse: boolean;
  onApps: () => void;
}) {
  const appsClass = ["dm-tool", "dm-tool--button", appsOpen ? "dm-tool--active" : "", appsPulse ? "dm-tool--pulse" : ""];
  return (
    <footer className="dm-toolbar">
      <div className="dm-toolbar__group">
        {LEFT.map((label) => (
          <DecorativeItem key={label} label={label} />
        ))}
      </div>
      <div className="dm-toolbar__group">
        {CENTER.map((label) => (
          <DecorativeItem key={label} label={label} badge={label === "Participants" ? participantCount : undefined} />
        ))}
        <button type="button" className={appsClass.filter(Boolean).join(" ")} aria-pressed={appsOpen} onClick={onApps}>
          <Icon label="Apps" />
          Apps
        </button>
      </div>
      <span className="dm-toolbar__end" aria-hidden="true">
        End
      </span>
    </footer>
  );
}
