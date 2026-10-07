"use client";

import { useRef } from "react";
import { toast } from "sonner";

import type { CheckListItem, RoomResponsesView } from "@/types/breakout";

/** How long one item stays put after a change, so the room cannot flip it back and forth. */
const TICK_COOLDOWN_MS = 5_000;

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
  const lastChangedAt = useRef(new Map<string, number>());

  /** `at` is the click's own timestamp, in milliseconds since the page loaded. */
  function changeTick(itemId: string, done: boolean, at: number) {
    const last = lastChangedAt.current.get(itemId);
    if (last !== undefined && at - last < TICK_COOLDOWN_MS) {
      toast.warning("Wait a few seconds before changing this item again.");
      return;
    }
    lastChangedAt.current.set(itemId, at);
    onTick(itemId, done);
  }

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
            onClick={(event) => changeTick(item.id, !tick, event.timeStamp)}
          >
            <span className="bw-checklist__box">{tick ? "✓" : ""}</span>
            <span className="bw-checklist__label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
