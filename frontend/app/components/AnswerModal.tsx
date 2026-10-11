"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ACTIVITY_KINDS } from "@/lib/activity-kinds";
import type { useRoomResponses } from "@/lib/use-room-responses";
import type { IndividualActivity } from "@/types/breakout";

import ActivityPrompt from "./ActivityPrompt";
import { Button, Modal } from "./ui";

const MAX_ANSWER_LENGTH = 2000;
const AUTOSAVE_DELAY_MS = 1500;

/**
 * Write a private answer, in the same shell as the host's activity modal with
 * Submit where the host has Done. Drafts autosave as "working" shortly after
 * typing stops, and closing the modal any way (outside click, Escape) saves the
 * draft first; a failed save keeps it open so nothing is lost. "Submit" marks
 * the answer "submitted"; editing after a submit sets it back to "working".
 */
export default function AnswerModal({
  activity,
  responses,
  onClose,
}: {
  activity: IndividualActivity;
  responses: ReturnType<typeof useRoomResponses>;
  onClose: () => void;
}) {
  const { view, saveAnswer } = responses;
  const kind = ACTIVITY_KINDS[activity.kind];
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

  async function submit(close: () => void) {
    if (!(await send("submitted"))) return;
    toast.success("Submitted to your host.");
    close();
  }

  return (
    <Modal
      label={kind.label}
      size="lg"
      locked={saving}
      beforeClose={async () => (changed ? send("working") : true)}
      onClose={onClose}
    >
      {(close) => (
        <>
          <header className="bw-overlay__header">
            <span className="bw-activity-badge" style={{ background: kind.tint, color: kind.ink }}>
              {kind.label}
            </span>
            <div className="bw-header-spacer" />
            <Button
              size="sm"
              disabled={!text.trim() || (saved?.status === "submitted" && !changed)}
              busy={saving}
              onClick={() => void submit(close)}
            >
              Submit
            </Button>
          </header>

          <div className="bw-overlay__body">
            <ActivityPrompt activity={activity} />
            <textarea
              className="bw-answer__box"
              value={text}
              autoFocus
              maxLength={MAX_ANSWER_LENGTH}
              placeholder="Write your answer here..."
              onChange={(event) => edit(event.target.value)}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
