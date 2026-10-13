import { AVATAR_TINTS, initialsFrom } from "@/lib/participant-status";

import { SectionLabel } from "./ui";

export interface RoomPerson {
  participantUUID: string;
  name: string;
  /** Short progress text, or null when there is nothing to track. */
  status: string | null;
  done: boolean;
}

/**
 * A participant screen's people list, laid out like the host's People column:
 * initials, full name, and progress on the right. Each person keeps one tint by
 * their place in the list.
 */
export default function RoomPeople({ heading, people }: { heading: string; people: RoomPerson[] }) {
  return (
    <section className="bw-session__column" aria-label={heading}>
      <SectionLabel>{heading}</SectionLabel>
      {people.map((person, index) => (
        <div className="bw-results__person" key={person.participantUUID}>
          <span className="bw-initials" style={{ background: AVATAR_TINTS[index % AVATAR_TINTS.length] }} aria-hidden>
            {initialsFrom(person.name)}
          </span>
          <span className="bw-results__person-name" title={person.name}>
            {person.name}
          </span>
          {person.status ? (
            <span className={`bw-room-member__status bw-room-member__status--${person.done ? "done" : "open"}`}>
              {person.status}
            </span>
          ) : null}
        </div>
      ))}
    </section>
  );
}
