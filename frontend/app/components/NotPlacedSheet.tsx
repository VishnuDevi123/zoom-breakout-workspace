"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { initialsFrom } from "@/lib/participant-status";
import type { LiveParticipant, PlannedRoom } from "@/types/breakout";

import { Button, Spinner } from "./ui";

/** Collapsed: the handle and the title row only. */
const MIN_HEIGHT_PX = 64;
/** Share of the space between header and navbar the sheet may cover. */
const MAX_SHARE = 0.6;
const KEY_STEP_PX = 24;

/**
 * People in the main room the live round has not placed, on a sheet over the
 * room grid. The host drags it taller or shorter; it never pushes the rooms
 * around, so it publishes its height and the grid pads its bottom by that much.
 */
export default function NotPlacedSheet({
  people,
  rooms,
  placing,
  onPlace,
  onPlaceEvenly,
}: {
  people: LiveParticipant[];
  rooms: PlannedRoom[];
  /** The participant being placed, "all" for Place evenly, or null. */
  placing: string | null;
  onPlace: (participantUUID: string, roomId: string) => void;
  onPlaceEvenly: () => void;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  // Null: size to the content, capped by CSS at 40%.
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    const area = sheet?.parentElement;
    if (!sheet || !area) return;
    const observer = new ResizeObserver(() => {
      area.style.setProperty("--bw-sheet-h", `${sheet.offsetHeight}px`);
    });
    observer.observe(sheet);
    return () => {
      observer.disconnect();
      area.style.removeProperty("--bw-sheet-h");
    };
  }, []);

  function maxHeight(): number {
    return (sheetRef.current?.parentElement?.clientHeight ?? 0) * MAX_SHARE;
  }

  function resizeTo(next: number) {
    setHeight(Math.min(Math.max(next, MIN_HEIGHT_PX), maxHeight()));
  }

  function toggleCollapsed() {
    setHeight(height === MIN_HEIGHT_PX ? null : MIN_HEIGHT_PX);
  }

  // Set only between a press on the handle and its release, so hovering never resizes.
  const dragging = useRef(false);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    // Stops the browser starting a text selection from the press.
    event.preventDefault();
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function stopDrag() {
    dragging.current = false;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    // A release outside the window can go unreported; no button held means the drag is over.
    if (event.buttons === 0) return stopDrag();
    const areaBottom = sheetRef.current?.parentElement?.getBoundingClientRect().bottom ?? 0;
    resizeTo(areaBottom - event.clientY);
  }

  function onHandleKey(event: KeyboardEvent<HTMLDivElement>) {
    const current = sheetRef.current?.offsetHeight ?? MIN_HEIGHT_PX;
    const moves: Record<string, () => void> = {
      ArrowUp: () => resizeTo(current + KEY_STEP_PX),
      ArrowDown: () => resizeTo(current - KEY_STEP_PX),
      Home: () => resizeTo(MIN_HEIGHT_PX),
      End: () => resizeTo(maxHeight()),
      Enter: toggleCollapsed,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
  }

  return (
    <section
      ref={sheetRef}
      className="bw-sheet"
      style={height === null ? undefined : { height, maxHeight: "none" }}
      aria-label="Not yet placed"
    >
      <div
        className="bw-sheet__handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the not yet placed list"
        aria-valuenow={height === null ? undefined : Math.round(height)}
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={stopDrag}
        onKeyDown={onHandleKey}
      />

      <header className="bw-sheet__header">
        <span className="bw-sheet__title">
          {people.length === 0 ? "Everyone is placed" : `Not yet placed (${people.length})`}
        </span>
        {people.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            busy={placing === "all"}
            disabled={placing !== null}
            onClick={onPlaceEvenly}
          >
            Place evenly
          </Button>
        ) : null}
      </header>

      <ul className="bw-sheet__list">
        {people.map((person) => (
          <li className="bw-sheet__person" key={person.participantUUID}>
            <span className="bw-initials" title={person.name} aria-hidden>
              {initialsFrom(person.name)}
            </span>
            <span className="bw-sheet__name" title={person.name}>{person.name}</span>
            {placing === person.participantUUID ? (
              <Spinner />
            ) : (
              <select
                className="bw-placement-select"
                aria-label={`Room for ${person.name}`}
                value=""
                disabled={placing !== null}
                onChange={(event) => onPlace(person.participantUUID, event.target.value)}
              >
                <option value="" disabled>
                  Room…
                </option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
