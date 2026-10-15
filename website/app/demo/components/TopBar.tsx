export type DemoView = "host" | "participant" | "both";

const VIEWS: { id: DemoView; label: string }[] = [
  { id: "host", label: "Host" },
  { id: "participant", label: "Participant" },
  { id: "both", label: "Both" },
];

/** Demo chrome above the meeting: our name, what this is, and whose screen to show. */
export default function TopBar({
  view,
  onViewChange,
  onReplay,
  onReset,
}: {
  view: DemoView;
  onViewChange: (view: DemoView) => void;
  onReplay: () => void;
  onReset: () => void;
}) {
  return (
    <header className="dm-topbar">
      <span className="dm-topbar__brand">
        <span className="dm-topbar__mark" aria-hidden="true">B</span>
        <span className="dm-topbar__name">Breakout Workspace</span>
      </span>
      <span className="dm-topbar__note">Interactive demo · simulated Zoom meeting</span>
      <div className="dm-topbar__spacer" />
      <div className="dm-switch" role="radiogroup" aria-label="Whose screen to show">
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={view === id}
            // "Both" needs room for two panels and the gallery; CSS hides it on narrow screens.
            className={`dm-switch__option${id === "both" ? " dm-switch__option--wide" : ""}`}
            onClick={() => onViewChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <button type="button" className="dm-topbar__action" onClick={onReplay}>
        Replay tour
      </button>
      <button type="button" className="dm-topbar__action" onClick={onReset}>
        Reset
      </button>
    </header>
  );
}
