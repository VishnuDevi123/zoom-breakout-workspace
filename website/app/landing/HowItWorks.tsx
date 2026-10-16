import { REPO_URL } from "./sections";

/** Who does what in a session: Zoom, the host and each participant. */
const ROLES = [
  {
    role: "zoom",
    tag: "Zoom",
    title: "Runs the meeting",
    body: "The call, audio and video, and the breakout rooms themselves. Moving people into rooms and back is Zoom's own feature; the app tells it what to do.",
  },
  {
    role: "host",
    tag: "Host",
    title: "Plans and runs the session",
    body: "Sets up the rounds, the rooms and who goes in each, then gives every round a task: a goal, steps, a checklist and activities such as a question each person answers or a shared idea board.",
  },
  {
    role: "participant",
    tag: "Participants",
    title: "Work on their room's task",
    body: "Wait in the main meeting until a round starts. Once Zoom moves them into their breakout room, the app shows that room's task, and they tick the shared checklist, answer the private question on their own and post notes to the idea board.",
  },
] as const;

/** The four stages of a session, the last one being what brings a host back. */
const STAGES = [
  {
    title: "Plan",
    body: "Add rounds and set how long each runs. Make the rooms and place people. Keep the same groups every round, or mix them. Write each round's task and activities, or describe the session and let AI draft all of it.",
  },
  {
    title: "Launch",
    body: "Press Launch. The app creates the round's breakout rooms in Zoom, assigns each person to their planned room and opens them. Zoom moves everyone in and the round timer starts.",
  },
  {
    title: "Follow live",
    body: "Each room works through its own task. The host sees every room's checklist ticks, answers and notes as they arrive, can add a minute, and ends the round to bring everyone back.",
  },
  {
    title: "Save and reuse",
    body: "Save the workflow as a template. It stays with the host's Zoom account, so the next session starts with one click in any meeting.",
  },
];

/** Outside services the server talks to, top to bottom in the diagram. */
const SERVICES = [
  {
    name: "Zoom servers",
    detail: "Webhooks",
    does: "Tell the server whenever someone joins or leaves a breakout room or the main meeting.",
    arrow: "who is where",
    direction: "in",
  },
  {
    name: "OpenAI",
    detail: "Workflow drafts",
    does: "Turns the host's description into rounds, rooms, tasks and activities.",
    arrow: "draft request",
    direction: "out",
  },
  {
    name: "AWS DynamoDB",
    detail: "Saved templates",
    does: "Keeps each host's saved workflows, tied to their Zoom account.",
    arrow: "save, load",
    direction: "out",
  },
] as const;

/** How a session runs, and the big picture of what talks to what. */
export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="lp-section lp-how"
      tabIndex={-1}
      aria-labelledby="lp-how-title"
    >
      <div className="lp-how__intro">
        <p className="lp-eyebrow">How it works</p>
        <h2 id="lp-how-title" className="lp-heading">
          Everyone opens it <em className="lp-accent">inside the meeting.</em>
        </h2>
        <p className="lp-how__lead">
          The host and every participant open it inside the Zoom meeting and
          each sees their own screen: the host plans and runs the session,
          participants see the task for the room they are in.
        </p>
      </div>

      <div className="lp-roles">
        {ROLES.map(({ role, tag, title, body }) => (
          <article key={role} className={`lp-role lp-role--${role}`}>
            <span className="lp-role__tag">{tag}</span>
            <h3 className="lp-role__title">{title}</h3>
            <p className="lp-role__body">{body}</p>
          </article>
        ))}
      </div>

      <h3 className="lp-how__subheading">A session, step by step</h3>

      <ol className="lp-stages">
        {STAGES.map(({ title, body }, index) => (
          <li
            key={title}
            className={`lp-stage${index === STAGES.length - 1 ? " lp-stage--save" : ""}`}
          >
            <span className="lp-stage__number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="lp-stage__title">{title}</h3>
            <p className="lp-stage__body">{body}</p>
            {index === STAGES.length - 1 ? <SavedTemplate /> : null}
          </li>
        ))}
      </ol>

      <h3 className="lp-how__subheading">The big picture</h3>
      <BigPicture />
      {/* <p className="lp-how__more">
        A detailed breakdown of the Zoom capabilities is coming to the DOCS on{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="lp-how__link"
        >
          GitHub
        </a>
        .
      </p> */}
    </section>
  );
}

/** A saved template as the app's library lists it. Decorative. */
function SavedTemplate() {
  return (
    <div className="lp-saved" aria-hidden="true">
      <span className="lp-saved__text">
        <span className="lp-saved__name">Nexus Day 1 onboarding</span>
        <span className="lp-saved__meta">Saved · 3 rounds · 50:00</span>
      </span>
      <span className="lp-saved__use">Use</span>
    </div>
  );
}

/**
 * Three columns: the Zoom client, the app's server, and the outside services. Arrows sit in the
 * gaps on wide screens; on phones the columns stack and each card says how it connects.
 */
function BigPicture() {
  return (
    <figure className="lp-picture" aria-label="How Breakout Workspace connects to Zoom and outside services">
      <div className="lp-node lp-node--client">
        <span className="lp-node__where">On each person&apos;s computer</span>
        <span className="lp-node__name">Zoom client</span>
        <div className="lp-node__inner lp-node__inner--meeting">
          <span className="lp-node__inner-name">Zoom meeting</span>
          <span className="lp-node__inner-does">Using breakout rooms</span>
        </div>
        <span className="lp-node__sdk">↕ Zoom Apps SDK</span>
        <div className="lp-node__inner lp-node__inner--app">
          <span className="lp-node__inner-name">Breakout Workspace app</span>
          <span className="lp-node__inner-does">
            Reads the users context to give them their own screen and capabilities.
          </span>
        </div>
      </div>

      <div className="lp-wire lp-wire--client" aria-hidden="true">
        <span className="lp-wire__label">plans, tasks, answers →</span>
        <span className="lp-wire__label">← live updates</span>
      </div>

      <div className="lp-node lp-node--server">
        <span className="lp-node__where">Our app&apos;s own server</span>
        <span className="lp-node__name">Breakout Workspace server</span>
        <ul className="lp-node__jobs">
          <li>Keeps the workflow, rooms, tasks and answers</li>
          <li>Tracks who is in which room</li>
          <li>Pushes every change to every open app</li>
          <li>Runs the round timer</li>
        </ul>
        <p className="lp-node__connect">Talks to every app in the meeting and to the three services it relies on.</p>
      </div>

      <div className="lp-wire lp-wire--services" aria-hidden="true">
        {SERVICES.map(({ name, arrow, direction }) => (
          <span key={name} className="lp-wire__label">
            {direction === "in" ? `← ${arrow}` : `${arrow} →`}
          </span>
        ))}
      </div>

      <div className="lp-services">
        {SERVICES.map(({ name, detail, does }) => (
          <div key={name} className="lp-node lp-node--service">
            <span className="lp-node__where">{detail}</span>
            <span className="lp-node__name">{name}</span>
            <span className="lp-node__does">{does}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
