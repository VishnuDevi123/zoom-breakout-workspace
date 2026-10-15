import type { Person } from "@/data/scenarios/types";

import type { Entry } from "../demo-state";

/** Avatar colours; a person keeps theirs in every view. */
const AVATAR_COLORS = ["#4262ff", "#0f9d8f", "#c2410c", "#7c3aed", "#be185d", "#15803d"];

function initials(name: string): string {
  return name
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarColor(id: string): string {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/**
 * Zoom-style gallery: one tile per person, camera off, muted. `leavingIds` fade
 * out (moving to breakout rooms); `speech` shows a bubble and a speaker ring.
 */
export default function Gallery({
  people,
  hostId,
  youId,
  leavingIds = [],
  speech = null,
  lastSaid = {},
  room = false,
}: {
  people: Person[];
  hostId: string;
  youId: string | null;
  leavingIds?: string[];
  speech?: Entry | null;
  /** Each person's last line; shown faded on their tile while someone else speaks. */
  lastSaid?: Record<string, string>;
  /** A small breakout room: big tiles, like Zoom with a few people. */
  room?: boolean;
}) {
  return (
    <div className={room ? "dm-gallery dm-gallery--room" : "dm-gallery"}>
      {people.map((person) => {
        const speaking = speech?.by === person.id;
        const classes = ["dm-tile", speaking ? "dm-tile--speaking" : "", leavingIds.includes(person.id) ? "dm-tile--leaving" : ""];
        return (
          <div key={person.id} className={classes.filter(Boolean).join(" ")}>
            {person.id === youId ? <span className="dm-tile__you">You</span> : null}
            {speaking || lastSaid[person.id] ? (
              // Keyed by the line, so each new line pops in.
              <span
                key={speaking ? speech.text : lastSaid[person.id]}
                className={speaking ? "dm-tile__bubble" : "dm-tile__bubble dm-tile__bubble--past"}
              >
                {speaking ? speech.text : lastSaid[person.id]}
              </span>
            ) : null}
            <span className="dm-tile__avatar" style={{ background: avatarColor(person.id) }} aria-hidden="true">
              {initials(person.name)}
            </span>
            <span className="dm-tile__name">
              {person.name}
              {person.id === hostId ? " (Host)" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
