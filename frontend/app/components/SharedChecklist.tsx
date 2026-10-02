"use client";

import type { CheckListItem, RoomResponsesView } from "@/types/breakout";

/**
 * The task's checklist, shared by the room: anyone ticks or unticks any item.
 * Used under the task on the room page, and
 * again on the shared board page.
 */
export default function SharedChecklist({
  items,
  view,
  onTick,
}: {
  items: CheckListItem[];
  view: RoomResponsesView | null;
  onTick: (itemId: string, done: boolean) => void;
}) {
  if (items.length === 0) return null;
  const doneCount = items.filter((item) => view?.ticks[item.id]).length;

  return (
    <div className="bw-checklist">
      <div className="bw-checklist__header">
        <span className="bw-checklist__title">Shared checklist</span>
        <div style={{ flex: 1 }} />
      </div>

      {items.map((item) => {
        const tick = view?.ticks[item.id];
        return (
          <button
            className={`bw-checklist__row${tick ? " bw-checklist__row--done" : ""}`}
            key={item.id}
            aria-pressed={Boolean(tick)}
            onClick={() => onTick(item.id, !tick)}
          >
            <span className="bw-checklist__box">{tick ? "✓" : ""}</span>
            <span className="bw-checklist__label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
