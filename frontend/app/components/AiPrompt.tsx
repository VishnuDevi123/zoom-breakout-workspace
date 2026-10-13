"use client";

import { useEffect, useState } from "react";

import { Button, Spinner } from "./ui";

const SUGGESTIONS = ["Speed networking", "Workshop, 3 activities", "New-hire icebreaker"];

/** Shown in turn while the AI works. The backend reports no progress, so these are timed. */
const STAGES = ["Reading your request…", "Setting up rounds and rooms…", "Writing tasks…", "Adding activities…"];
const STAGE_MS = 3000;

/** The landing's AI box: describe the session, Generate; while waiting, a timed progress line and Cancel. */
export default function AiPrompt({
  pending,
  onGenerate,
  onCancel,
}: {
  pending: boolean;
  /** Resolves true when the AI answered, so the box clears; false keeps the text. */
  onGenerate: (text: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const request = text.trim();

  async function generate() {
    if (!request || pending) return;
    if (await onGenerate(request)) setText("");
  }

  return (
    <div className="bw-ai-prompt">
      <form
        className="bw-ai-prompt__field"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <span className="bw-ai-prompt__spark" aria-hidden="true">✦</span>
        <input
          className="bw-ai-prompt__input"
          value={text}
          maxLength={2000}
          placeholder="e.g. 45-min team retro, new groups each round"
          aria-label="Describe your session"
          readOnly={pending}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" disabled={!request || pending} aria-busy={pending}>
          {pending ? (
            <span className="bw-ai-prompt__busy">
              <Spinner /> Generating
            </span>
          ) : (
            "Generate"
          )}
        </Button>
      </form>

      {pending ? (
        <GeneratingStatus onCancel={onCancel} />
      ) : (
        <div className="bw-ai-prompt__chips">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" className="bw-chip" onClick={() => setText(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mounted per request, so the stages start from the first each time. */
function GeneratingStatus({ onCancel }: { onCancel: () => void }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStage((current) => Math.min(current + 1, STAGES.length - 1)), STAGE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bw-ai-progress" role="status">
      <div className="bw-ai-progress__track">
        <div className="bw-ai-progress__bar" />
      </div>
      <div className="bw-ai-progress__row">
        <span>{STAGES[stage]}</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
