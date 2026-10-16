import Link from "next/link";

import AppMock from "./AppMock";

/** Top of the landing page: the hook, the two ways in, and the app as it looks in Zoom. */
export default function Hero() {
  return (
    <section id="home" className="lp-section lp-hero" tabIndex={-1} aria-labelledby="lp-hero-title">
      <p className="lp-hero__eyebrow lp-rise">
        <span className="lp-hero__eyebrow-dot" aria-hidden="true" />A Zoom App prototype
      </p>
      <h1 id="lp-hero-title" className="lp-hero__title lp-rise">
        Breakout rooms that <em className="lp-accent">know the plan.</em>
      </h1>
      <p className="lp-hero__lead lp-rise">
        Describe your session and AI builds the rounds, rooms, tasks and activities. Every room opens with its task, you
        follow every room from one panel, and a saved workflow runs again next time with one click.
      </p>
      <div className="lp-hero__actions lp-rise">
        <Link href="/demo" className="lp-button lp-button--primary">
          Try the interactive demo
          <span aria-hidden="true">→</span>
        </Link>
        <a href="#how-it-works" className="lp-button lp-button--ghost">
          How it works
        </a>
      </div>
      <p className="lp-hero__note lp-rise">Runs a simulated meeting in your browser </p>

      <div className="lp-hero__stage lp-rise">
        <GhostCards />
        <AppMock />
      </div>
    </section>
  );
}

/** Faded app moments drifting around the mock: what happens after Generate. */
function GhostCards() {
  return (
    <div className="lp-ghosts" aria-hidden="true">
      <div className="lp-ghost lp-ghost--room">
        <span className="lp-ghost__label">Room 2 · in progress</span>
        <span className="lp-ghost__faces">
          <span style={{ background: "var(--bw-dot-2)" }}>MC</span>
          <span style={{ background: "var(--bw-dot-4)" }}>LO</span>
          <span style={{ background: "var(--bw-dot-5)" }}>PR</span>
          <span style={{ background: "var(--bw-dot-1)" }}>A</span>
        </span>
      </div>
      <div className="lp-ghost lp-ghost--clock">
        <span className="lp-ghost__label">Round 1 of 3</span>
        <span className="lp-ghost__clock">12:40</span>
      </div>
      <div className="lp-ghost lp-ghost--checklist">
        <span className="lp-ghost__label">Checklist · 2 of 3</span>
        <span className="lp-ghost__tick lp-ghost__tick--done">Share one first-week goal</span>
        <span className="lp-ghost__tick lp-ghost__tick--done">Match it to a value</span>
        <span className="lp-ghost__tick">Post to the idea board</span>
      </div>
      <div className="lp-ghost lp-ghost--note">“Ask customers before we build.”</div>
    </div>
  );
}
