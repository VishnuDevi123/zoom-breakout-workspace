"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { REPO_URL } from "./sections";

const QUESTIONS: { question: string; answer: ReactNode }[] = [
  {
    question: "What does the AI see?",
    answer: (
      <>
        Only what the host types to plan the session, plus the draft it is working on: rounds, timings, room names, tasks
        and activities. It never sees who is in the meeting or anything participants write. And it only suggests:
        nothing changes until the host presses <q>Use this workflow</q>.
      </>
    ),
  },
  {
    question: "Can the app hear or record what happens in the rooms?",
    answer:
      "No. Zoom keeps each breakout room's audio and video inside that room, and the app never receives any of it. It only knows who is in which room and what people type into the app. Its job is to keep each room on task, not to listen in.",
  },
  {
    question: "How long are answers kept?",
    answer:
      "Only while the session runs. When the host ends the workflow, answers, notes and ticks are deleted. What stays is the plan itself, without any names, so it can be run again.",
  },
  {
    question: "What's in a saved template?",
    answer:
      "The plan: rounds, timings, room names, tasks and activities. Never the participants or answers. Templates belong to the host's Zoom account, so host can reuse them in future meetings with one click.",
  },
  {
    question: "Does it replace Zoom's breakout rooms?",
    answer:
      "No, it works with them. Zoom still creates the rooms and moves people in and out. Breakout Workspace tells Zoom who goes where, and gives every room something clear to work on.",
  },
  {
    question: "What if someone joins late, or the plan changes mid-round?",
    answer:
      "The host can place a latecomer into a room while the round runs, edit the task, add a minute or skip a round. Every room sees the change straight away.",
  },
  {
    question: "Can I use it in my meetings today?",
    answer: (
      <>
        Not yet. Breakout Workspace is a prototype and is not on the Zoom App Marketplace. For now, try the{" "}
        <Link href="/demo" className="lp-faq__link">
          interactive demo
        </Link>{" "}
        or read the code on{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="lp-faq__link">
          GitHub
        </a>
        .
      </>
    ),
  },
];

/** Common questions in an accordion; any number can be open, the first starts open. */
export default function Faq() {
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set([0]));

  function toggle(index: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <section id="faq" className="lp-section lp-faq" tabIndex={-1} aria-labelledby="lp-faq-title">
      <div>
        <p className="lp-eyebrow">FAQ</p>
        <h2 id="lp-faq-title" className="lp-heading">
          Questions, <em className="lp-accent">answered.</em>
        </h2>
      </div>
      <ul className="lp-faq__list">
        {QUESTIONS.map(({ question, answer }, index) => {
          const isOpen = open.has(index);
          return (
            <li key={question} className={`lp-faq__item${isOpen ? " lp-faq__item--open" : ""}`}>
              <h3 className="lp-faq__question">
                <button
                  type="button"
                  className="lp-faq__toggle"
                  aria-expanded={isOpen}
                  aria-controls={`lp-faq-answer-${index}`}
                  onClick={() => toggle(index)}
                >
                  {question}
                  <span className="lp-faq__icon" aria-hidden="true" />
                </button>
              </h3>
              <div id={`lp-faq-answer-${index}`} className="lp-faq__answer" inert={!isOpen}>
                <div className="lp-faq__answer-clip">
                  <p className="lp-faq__answer-text">{answer}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
