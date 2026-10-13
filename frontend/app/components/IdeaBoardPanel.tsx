"use client";

import { useState } from "react";

import type { useRoomResponses } from "@/lib/use-room-responses";
import type { CheckListItem, IdeaBoardActivity, IdeaNote } from "@/types/breakout";

import ActivityPrompt from "./ActivityPrompt";
import RoomPeople from "./RoomPeople";
import SharedChecklist from "./SharedChecklist";
import { Button } from "./ui";

/**
 * The room's shared board: everyone's sticky notes, oldest first, and a card to
 * add another. Only a note's author can edit or remove it. "← All activities"
 * sits above the question; the right column shows who has added ideas, then the
 * task's shared checklist.
 */
export default function IdeaBoardPanel({
  activity,
  members,
  participantUUID,
  checklist,
  responses,
  onBack,
}: {
  activity: IdeaBoardActivity;
  members: { participantUUID: string; name: string }[];
  participantUUID: string;
  checklist: CheckListItem[];
  responses: ReturnType<typeof useRoomResponses>;
  onBack: () => void;
}) {
  const { view, addIdea, editIdea, removeIdea, setTick } = responses;
  const [newIdea, setNewIdea] = useState("");
  const [adding, setAdding] = useState(false);
  const notes = view?.ideas[activity.id] ?? [];
  // A board counts as done for someone once they have added a note.
  const people = members.map((member) => {
    const count = notes.filter((note) => note.participantUUID === member.participantUUID).length;
    return { ...member, status: count > 0 ? `${count} ${count === 1 ? "idea" : "ideas"}` : "No ideas yet", done: count > 0 };
  });

  async function add() {
    setAdding(true);
    if (await addIdea(activity.id, newIdea)) setNewIdea("");
    setAdding(false);
  }

  return (
    <>
      <section className="bw-session__column">
        {/* Same back link as the host's room results ("← All rooms"). */}
        <button type="button" className="bw-results__back" onClick={onBack}>
          ← All activities
        </button>
        <ActivityPrompt activity={activity} />

        <div className="bw-board">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              own={note.participantUUID === participantUUID}
              onSave={(title, description) => editIdea(activity.id, note.id, title, description)}
              onRemove={() => removeIdea(activity.id, note.id)}
            />
          ))}
        </div>

        {/* Pinned to the bottom left of the main column, below however many notes there are. */}
        <div className="bw-board__add">
          <input
            className="bw-board__input"
            value={newIdea}
            placeholder="Add another idea…"
            onChange={(event) => setNewIdea(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newIdea.trim() && !adding) void add();
            }}
          />
          <Button size="sm" disabled={!newIdea.trim() || adding} onClick={() => void add()}>
            Add
          </Button>
        </div>
      </section>

      <div className="bw-session__column">
        <RoomPeople heading="Working on this board" people={people} />
        <SharedChecklist items={checklist} view={view} onTick={(itemId, done) => void setTick(itemId, done)} />
      </div>
    </>
  );
}

/** One sticky note. Editing happens in place; removing asks for a second click. */
function NoteCard({
  note,
  own,
  onSave,
  onRemove,
}: {
  note: IdeaNote;
  own: boolean;
  onSave: (title: string, description: string) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [description, setDescription] = useState(note.description);

  async function save() {
    if (await onSave(title.trim(), description.trim())) setEditing(false);
  }

  if (editing) {
    return (
      <div className="bw-note" style={{ background: note.color }}>
        <input className="bw-note__title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        <textarea
          className="bw-note__text-input"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="bw-note__footer">
          <div style={{ flex: 1 }} />
          <button className="bw-note__action" onClick={() => setEditing(false)}>Cancel</button>
          <button
            className="bw-note__action bw-note__action--strong"
            disabled={!title.trim() || !description.trim()}
            onClick={() => void save()}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bw-note" style={{ background: note.color }}>
      <span className="bw-note__title">{note.title}</span>
      <p className="bw-note__text">{note.description}</p>
      <div className="bw-note__footer">
        <span className="bw-note__author">{own ? "You" : note.authorName}</span>
        <div style={{ flex: 1 }} />
        {own && confirming ? (
          <>
            <button className="bw-note__action" onClick={() => setConfirming(false)}>Keep</button>
            <button className="bw-note__action bw-note__action--danger" onClick={() => void onRemove()}>
              Remove?
            </button>
          </>
        ) : null}
        {own && !confirming ? (
          <>
            <button
              className="bw-note__action"
              onClick={() => {
                setTitle(note.title);
                setDescription(note.description);
                setEditing(true);
              }}
            >
              Edit
            </button>
            <button className="bw-note__action" onClick={() => setConfirming(true)}>Remove</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
