import Image from "next/image";

import PointedDemoLink from "./PointedDemoLink";

const TOUR_STEPS = [
  { title: "Plan it with AI", body: "One prompt becomes a three-round onboarding workflow." },
  { title: "Join a room", body: "As Alex in Room 2, find the task, think alone, then share." },
  { title: "Follow every room", body: "Back as host, watch answers arrive and end the round." },
];

/** What the interactive demo is, the way in, and a still of the demo itself. */
export default function DemoSection() {
  return (
    <section id="demo" className="lp-section lp-demo" tabIndex={-1} aria-labelledby="lp-demo-title">
      <div className="lp-demo__intro">
        <p className="lp-eyebrow">Interactive demo</p>
        <h2 id="lp-demo-title" className="lp-heading">
          Run a breakout round, <em className="lp-accent">start to finish.</em>
        </h2>
        <p className="lp-demo__lead">
          A simulated Zoom meeting in your browser. You host a Day 1 onboarding session for Nexus Corp, a fictional
          company, then step into a room as a participant.
        </p>
        <PointedDemoLink />
        <p className="lp-demo__note">About 2 minutes</p>
      </div>
      <ol className="lp-demo__steps">
        {TOUR_STEPS.map(({ title, body }, index) => (
          <li key={title} className="lp-demo__step">
            <span className="lp-demo__step-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="lp-demo__step-text">
              <span className="lp-demo__step-title">{title}</span>
              <span className="lp-demo__step-body">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <DemoScreens />
    </section>
  );
}

/** One screen per person, so nobody reads the two panels as one person's screen. */
const SCREENS = [
  {
    role: "host",
    who: "Jordan, the host",
    says: "Stays in the main meeting and follows every room's progress.",
    src: "/landing/demo-host-view.webp",
    alt: "Jordan's screen: the main meeting with only the host left, and the host panel showing four room cards with ticks, answers and notes, and End round with 14:32 left.",
  },
  {
    role: "participant",
    who: "Alex, in Room 2",
    says: "Talks with the room and works through the task in the participant panel.",
    src: "/landing/demo-participant-view.webp",
    alt: "Alex's screen: Room 2 with four people talking, and the participant panel showing the round's goal, four steps and a ticked shared checklist.",
  },
] as const;

/** Screenshots of the demo during round 1, one from each person's seat. Retake them when the demo's look changes. */
function DemoScreens() {
  return (
    <div className="lp-screens">
      <p className="lp-screens__intro">Same round, two people, two screens.</p>
      {SCREENS.map(({ role, who, says, src, alt }) => (
        <figure key={role} className={`lp-screen lp-screen--${role}`}>
          <figcaption className="lp-screen__caption">
            <span className="lp-screen__role">{role === "host" ? "Host" : "Participant"}</span>
            <span className="lp-screen__who">{who}</span>
            <span className="lp-screen__says">{says}</span>
          </figcaption>
          <div className="lp-screen__frame">
            <Image
              src={src}
              width={2360}
              height={1496}
              unoptimized
              sizes="(max-width: 900px) 100vw, 560px"
              className="lp-screen__image"
              alt={alt}
            />
          </div>
        </figure>
      ))}
    </div>
  );
}
