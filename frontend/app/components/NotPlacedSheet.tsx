"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { initialsFrom } from "@/lib/participant-status";
import type { PlannedRoom } from "@/types/breakout";

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
export interface SheetPerson {
  participantUUID: string;
  name: string;
}

/** Where a choice in a person's drop-down sends them, besides a room. */
const KEEP_IN_MAIN = "stay-in-main";
const BACK_TO_WAITING = "not-placed";

export default function NotPlacedSheet({
  people,
  rooms,
  placing,
  onPlace,
  onPlaceEvenly,
  stayingInMain = [],
  onKeepInMain,
  onReturn,
}: {
  people: SheetPerson[];
  rooms: PlannedRoom[];
  /** The participant being placed, "all" for Place evenly, or null. */
  placing: string | null;
  onPlace: (participantUUID: string, roomId: string) => void;
  onPlaceEvenly: () => void;
  /** Planning only: people the host chose to keep in the main room. */
  stayingInMain?: SheetPerson[];
  /** Planning only: offers "Stay in main" in each waiting person's drop-down. */
  onKeepInMain?: (participantUUID: string) => void;
  /** Planning only: moves someone kept in main back to the waiting list. */
  onReturn?: (participantUUID: string) => void;
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
          <SheetRow key={person.participantUUID} person={person} busy={placing === person.participantUUID}>
            <select
              className="bw-placement-select"
              aria-label={`Room for ${person.name}`}
              value=""
              disabled={placing !== null}
              onChange={(event) => {
                const choice = event.target.value;
                if (choice === KEEP_IN_MAIN) onKeepInMain?.(person.participantUUID);
                else onPlace(person.participantUUID, choice);
              }}
            >
              <option value="" disabled>
                Room…
              </option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
              {onKeepInMain ? <option value={KEEP_IN_MAIN}>Stay in main</option> : null}
            </select>
          </SheetRow>
        ))}
      </ul>

      {stayingInMain.length > 0 ? (
        <>
          <span className="bw-sheet__subtitle">Staying in main ({stayingInMain.length})</span>
          <ul className="bw-sheet__list">
            {stayingInMain.map((person) => (
              <SheetRow key={person.participantUUID} person={person} busy={false}>
                <select
                  className="bw-placement-select"
                  aria-label={`Room for ${person.name}`}
                  value=""
                  onChange={(event) => {
                    const choice = event.target.value;
                    if (choice === BACK_TO_WAITING) onReturn?.(person.participantUUID);
                    else onPlace(person.participantUUID, choice);
                  }}
                >
                  <option value="" disabled>
                    Move…
                  </option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                  <option value={BACK_TO_WAITING}>Not yet placed</option>
                </select>
              </SheetRow>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** One person on the sheet: initials, name and whatever control places them. */
function SheetRow({ person, busy, children }: { person: SheetPerson; busy: boolean; children: ReactNode }) {
  return (
    <li className="bw-sheet__person">
      <span className="bw-initials" title={person.name} aria-hidden>
        {initialsFrom(person.name)}
      </span>
      <span className="bw-sheet__name" title={person.name}>
        {person.name}
      </span>
      {busy ? <Spinner /> : children}
    </li>
  );
}
