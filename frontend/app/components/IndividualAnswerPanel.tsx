"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { useRoomResponses } from "@/lib/use-room-responses";
import type { IndividualActivity } from "@/types/breakout";

import ActivityPrompt from "./ActivityPrompt";
import { Button, SectionLabel } from "./ui";

const MAX_ANSWER_LENGTH = 2000;
const AUTOSAVE_DELAY_MS = 1500;

const STATUS_TEXT = { submitted: "Submitted", working: "Writing…" } as const;

/**
 * Write a private answer. Drafts autosave as "working" shortly after typing
 * stops and on blur, so a dropped connection keeps them; "Submit to host" marks
 * the answer "submitted". Editing after a submit sets it back to "working" until
 * it is submitted again. The right column shows each member's status, never text.
 */
export default function IndividualAnswerPanel({
  activity,
  members,
  responses,
  onBack,
}: {
  activity: IndividualActivity;
  members: { participantUUID: string; name: string }[];
  responses: ReturnType<typeof useRoomResponses>;
  onBack: () => void;
}) {
  const { view, saveAnswer } = responses;
  const saved = view?.myAnswers[activity.id];
  // Null until the participant types, so a refetch never overwrites what they are writing.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const text = draft ?? saved?.text ?? "";
  const changed = text.trim() !== (saved?.text ?? "");

  useEffect(() => () => clearTimeout(timer.current), []);

  async function send(status: "working" | "submitted") {
    clearTimeout(timer.current);
    setSaving(true);
    const ok = await saveAnswer(activity.id, text, status);
    setSaving(false);
    return ok;
  }

  function edit(next: string) {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveAnswer(activity.id, next, "working"), AUTOSAVE_DELAY_MS);
  }

  async function submit() {
    if (await send("submitted")) toast.success("Submitted to your host.");
  }

  const statuses = view?.statuses[activity.id] ?? {};

  return (
    <>
      <main className="bw-main">
        <ActivityPrompt activity={activity} />

        <textarea
          className="bw-answer__box"
          value={text}
          maxLength={MAX_ANSWER_LENGTH}
          placeholder="Write your answer here..."
          onChange={(event) => edit(event.target.value)}
          onBlur={() => {
            if (changed) void send("working");
          }}
        />

        <div className="bw-answer__actions">
          <Button
            disabled={!text.trim() || saving || (saved?.status === "submitted" && !changed)}
            onClick={() => void submit()}
          >
            Submit to Host
          </Button>
        </div>
      </main>

      <aside className="bw-rail bw-activity-side">
        <SectionLabel>Who has submitted</SectionLabel>
        {members.map((member) => {
          const status = statuses[member.participantUUID];
          return (
            <div className="bw-answer__member" key={member.participantUUID}>
              <span className="bw-room-member__name">{member.name}</span>
              <span className={`bw-room-member__status bw-room-member__status--${status === "submitted" ? "done" : "open"}`}>
                {status ? STATUS_TEXT[status] : "Not started"}
              </span>
            </div>
          );
        })}
        <Button variant="secondary" className="bw-activity-side__back" onClick={onBack}>
          Back to activities
        </Button>
      </aside>
    </>
  );
}
