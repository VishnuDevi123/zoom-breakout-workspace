import type { ReactNode } from "react";

import type { Person } from "@/data/scenarios/types";

/** Breakout Workspace docked where Zoom shows an app: app header, whose view, then the app. */
export default function AppPanel({ role, person, children }: { role: "host" | "participant"; person: Person; children: ReactNode }) {
  return (
    <aside className={`dm-panel dm-panel--${role}`} aria-label={`${role === "host" ? "Host" : "Participant"} app panel`}>
      <header className="dm-panel__header">
        <span className="dm-topbar__mark" aria-hidden="true">B</span>
        <span className="dm-panel__app">Breakout Workspace</span>
      </header>
      <div className="dm-panel__who">
        {role === "host" ? "Host view" : "Participant view"} · <strong>{person.name}</strong>
      </div>
      <div className="dm-panel__body">{children}</div>
    </aside>
  );
}
