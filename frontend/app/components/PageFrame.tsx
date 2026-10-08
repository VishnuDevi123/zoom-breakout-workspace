import type { ReactNode } from "react";

export interface FrameTab<T extends string> {
  id: T;
  label: string;
}

/**
 * The screen shape shared by the live round and round setup: a top bar, one
 * scrolling page, an optional sheet laid over the page's bottom edge, and a
 * bottom navbar of tabs. Callers fill the bar and the page; the frame owns layout.
 */
export default function PageFrame<T extends string>({
  tone = "live",
  bar,
  tabs,
  activeTab,
  onTabChange,
  tabsLabel,
  sheet,
  contentKey,
  children,
}: {
  /** "planning" lightens the top bar so setting up a round never looks live. */
  tone?: "live" | "planning";
  /** Contents of the top bar, left to right. */
  bar: ReactNode;
  tabs: FrameTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  /** Accessible name for the navbar. */
  tabsLabel: string;
  /** Overlays the bottom of the page; it reads its parent's height to size itself. */
  sheet?: ReactNode;
  /** A new value fades the page in again, e.g. on a tab or round change. */
  contentKey?: string;
  children: ReactNode;
}) {
  return (
    <div className={tone === "planning" ? "bw-frame bw-frame--planning" : "bw-frame"}>
      <header className="bw-frame__bar">{bar}</header>

      <div className="bw-frame__main">
        <main className="bw-frame__page">
          <div className="bw-frame__content" key={contentKey}>
            {children}
          </div>
        </main>
        {sheet}
      </div>

      <nav className="bw-frame__nav" aria-label={tabsLabel}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="bw-frame__tab"
            aria-current={activeTab === tab.id ? "page" : undefined}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
