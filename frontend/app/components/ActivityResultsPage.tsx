"use client";

import { PROGRESS_LABELS } from "@/lib/activity-kinds";
import { initialsFrom } from "@/lib/participant-status";
import type { Activity, IndividualAnswer, RoomResponsesHostView } from "@/types/breakout";

import { progressText, type RoomPerson } from "./RoomResultsPage";
import { Card, Pill, SectionLabel } from "./ui";

/**
 * One activity's submissions in one room, for the host. Individual answers show
 * their text only once submitted; a board shows its notes as the room sees them.
 */
export default function ActivityResultsPage({
  activity,
  roomName,
  people,
  results,
  onBack,
}: {
  activity: Activity;
  roomName: string;
  people: RoomPerson[];
  results: RoomResponsesHostView | null;
  onBack: () => void;
}) {
  return (
    <div className="bw-results">
      <button type="button" className="bw-results__back" onClick={onBack}>
        ← {roomName}
      </button>

      <div className="bw-results__heading">
        <div className="bw-results__heading-text">
          <SectionLabel>{activity.kind === "individual" ? "Question" : "Idea board"}</SectionLabel>
          <h2 className="bw-results__question">{activity.title}</h2>
          {activity.description ? <p className="bw-results__details">{activity.description}</p> : null}
        </div>
        
      </div>

      {activity.kind === "individual" ? (
        <IndividualAnswers
          people={people}
          answers={results?.answers[activity.id] ?? {}}
        />
      ) : (
        <BoardNotes notes={results?.ideas[activity.id] ?? []} />
      )}
    </div>
  );
}

function IndividualAnswers({
  people,
  answers,
}: {
  people: RoomPerson[];
  answers: Record<string, IndividualAnswer>;
}) {
  return (
    <div className="bw-results__answers">
      {people.map((person) => {
        const answer = answers[person.participantUUID];
        const status = answer ? (answer.status === "submitted" ? "completed" : "working") : "notStarted";
        return (
          <Card className="bw-results__answer" key={person.participantUUID}>
            <div className="bw-results__answer-head">
              <span className="bw-initials" aria-hidden>
                {initialsFrom(person.name)}
              </span>
              <span className="bw-results__person-name" title={person.name}>{person.name}</span>
              {status === "completed" ? null : (
                <Pill tone={status === "working" ? "amber" : "neutral"}>{PROGRESS_LABELS[status]}</Pill>
              )}
            </div>
            {answer?.status === "submitted" ? <p className="bw-results__answer-text">{answer.text}</p> : null}
          </Card>
        );
      })}
    </div>
  );
}

function BoardNotes({ notes }: { notes: RoomResponsesHostView["ideas"][string] }) {
  if (notes.length === 0) return <span className="bw-results__meta">No ideas yet.</span>;

  return (
    <div className="bw-board">
      {notes.map((note) => (
        <div className="bw-note" key={note.id} style={{ background: note.color }}>
          <span className="bw-note__title">{note.title}</span>
          <p className="bw-note__text">{note.description}</p>
          <div className="bw-note__footer">
            <span className="bw-note__author">{note.authorName}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
