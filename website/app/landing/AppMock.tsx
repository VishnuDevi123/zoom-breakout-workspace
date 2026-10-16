"use client";

import { useEffect, useState } from "react";

/** What the prompt types, in turn; the first is the demo's Nexus onboarding session. */
const PROMPTS = [
  "Day 1 onboarding for new hires, 3 rounds, new groups each round",
  "45-min team retro, 2 rounds, same rooms",
  "Speed networking for 40 students, 4 short rounds",
];
const TYPE_MS = 45;
const HOLD_MS = 2600;

type Typed = { prompt: number; chars: number };

/** The next typing state and how long to wait for it; null once a still (reduced motion) prompt is whole. */
function nextTyped(shown: Typed, still: boolean): { next: Typed; delay: number } | null {
  const full = PROMPTS[shown.prompt];
  if (shown.chars < full.length) {
    return still
      ? { next: { prompt: shown.prompt, chars: full.length }, delay: 0 }
      : { next: { prompt: shown.prompt, chars: shown.chars + 1 }, delay: TYPE_MS };
  }
  if (still) return null;
  return { next: { prompt: (shown.prompt + 1) % PROMPTS.length, chars: 0 }, delay: HOLD_MS };
}

/** Cycles through PROMPTS one character at a time; reduced motion shows the first one whole. */
function useTypedPrompt(): string {
  const [shown, setShown] = useState<Typed>({ prompt: 0, chars: 0 });

  useEffect(() => {
    const step = nextTyped(shown, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (!step) return;
    const timer = setTimeout(() => setShown(step.next), step.delay);
    return () => clearTimeout(timer);
  }, [shown]);

  return PROMPTS[shown.prompt].slice(0, shown.chars);
}

/**
 * The app's host home screen as it looks inside the Zoom client, rebuilt in HTML so it stays
 * sharp. Decorative: nothing in it can be clicked.
 */
export default function AppMock() {
  const prompt = useTypedPrompt();

  return (
    <div className="lp-mock" role="img" aria-label="Breakout Workspace host home screen inside a Zoom meeting">
      <div className="lp-mock__chrome" aria-hidden="true">
        <span className="lp-mock__dot" />
        <span className="lp-mock__dot" />
        <span className="lp-mock__dot" />
        <span className="lp-mock__chrome-title">Zoom Apps · Breakout Workspace</span>
      </div>
      <div className="lp-mock__app" aria-hidden="true">
        <div className="lp-mock__bar">
          <span className="lp-mock__mark">B</span>
          <span className="lp-mock__titles">
            <span className="lp-mock__title">Breakout Workspace</span>
            <span className="lp-mock__subtitle">Hosting Jordan Lee&apos;s Zoom Meeting · 14 people</span>
          </span>
        </div>
        <div className="lp-mock__body">
          <span className="lp-mock__heading">What&apos;s your session today?</span>
          <span className="lp-mock__lead">Describe it and AI builds the rounds, rooms, tasks and activities.</span>
          <div className="lp-mock__ai">
            <div className="lp-mock__prompt">
              <span className="lp-mock__spark">✦</span>
              <span className="lp-mock__typed">
                {prompt}
                <span className="lp-mock__caret" />
              </span>
              <span className={`lp-mock__generate${prompt ? " lp-mock__generate--ready" : ""}`}>Generate</span>
            </div>
            <div className="lp-mock__chips">
              <span className="lp-mock__chip">Speed networking</span>
              <span className="lp-mock__chip">Workshop, 3 activities</span>
              <span className="lp-mock__chip">New-hire icebreaker</span>
            </div>
          </div>
          <span className="lp-mock__or">or build it yourself</span>
          <div className="lp-mock__builds">
            <span className="lp-mock__build">Build a workflow</span>
            <span className="lp-mock__build">Start with one round</span>
          </div>
          <div className="lp-mock__tabs">
            <span className="lp-mock__tab lp-mock__tab--active">Templates</span>
            <span className="lp-mock__tab">Saved · 1</span>
            <span className="lp-mock__tab">Past</span>
          </div>
          <TemplateRow name="Rotating intros" meta="3 rounds · 13:00" />
          <TemplateRow name="Speed mentoring" meta="4 rounds · 14:30" />
        </div>
      </div>
    </div>
  );
}

function TemplateRow({ name, meta }: { name: string; meta: string }) {
  return (
    <div className="lp-mock__row">
      <span className="lp-mock__titles">
        <span className="lp-mock__row-name">{name}</span>
        <span className="lp-mock__row-meta">{meta}</span>
      </span>
      <span className="lp-mock__use">Use</span>
    </div>
  );
}
