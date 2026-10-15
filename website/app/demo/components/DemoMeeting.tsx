"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

import type { Scenario } from "@/data/scenarios/types";

import { formatClock } from "../clock";
import { roomsFor, visitorRoom } from "../demo-state";
import { useRoundRuntime } from "../use-round-runtime";
import AppPanel from "./AppPanel";
import Gallery from "./Gallery";
import HostApp from "./HostApp";
import ParticipantApp from "./ParticipantApp";
import Toolbar from "./Toolbar";
import TopBar, { type DemoView } from "./TopBar";
import TourCard, { reached } from "./TourCard";

/** Matches the CSS breakpoint that hides "Both". */
const NARROW_QUERY = "(max-width: 760px)";

function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on phone widths, where two panels and the gallery cannot fit side by side. */
function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

/**
 * The simulated meeting: top bar, meeting gallery, Zoom-style toolbar and the
 * Breakout Workspace panels docked where Zoom shows an app. "both" puts the
 * host panel left and the participant panel right of the gallery. While a round
 * runs the host is alone in the main meeting and the visitor sees their room.
 */
export default function DemoMeeting({
  scenario,
  tour,
  appsOpen,
  onTourClose,
  onReplay,
  onReset,
}: {
  scenario: Scenario;
  /** True while the guided tour runs. */
  tour: boolean;
  /** Start with both app panels open (exploring); the tour has the visitor open them. */
  appsOpen: boolean;
  onTourClose: () => void;
  onReplay: () => void;
  onReset: () => void;
}) {
  // The visitor's own view choice, and the tour step they made it at.
  const [picked, setPicked] = useState<{ view: DemoView; step: number }>({ view: "both", step: -1 });
  const [stepFloor, setStepFloor] = useState(0);
  const runtime = useRoundRuntime(scenario, appsOpen);
  const { state, dispatch } = runtime;
  const narrow = useNarrowScreen();

  // A step that waits for something moves on by itself once it happened; Next moves the floor.
  let stepIndex = stepFloor;
  while (stepIndex < scenario.tour.length - 1) {
    const until = scenario.tour[stepIndex].until;
    if (!until || !reached(until, state, scenario.visitor.id)) break;
    stepIndex += 1;
  }
  const step = tour ? scenario.tour[stepIndex] : null;

  // The tour shows whose screen each step needs; a view the visitor picks holds until the tour switches again.
  const tourViewStep = scenario.tour.findLastIndex((candidate, index) => index <= stepIndex && candidate.view);
  const tourView = scenario.tour[tourViewStep]?.view;
  const chosenView: DemoView = tour && tourView && picked.step < tourViewStep ? tourView : picked.view;
  // "Both" cannot fit on a phone; the participant side tells the story there.
  const view: DemoView = narrow && chosenView === "both" ? "participant" : chosenView;
  const everyone = [scenario.host, scenario.visitor, ...scenario.people];
  const you = view === "host" ? scenario.host.id : view === "participant" ? scenario.visitor.id : null;
  const inRooms = state.phase === "live";
  const room = visitorRoom(scenario, state.roundIndex);
  const roomPeople = roomsFor(scenario, state.roundIndex)[room].map((id) => everyone.find((person) => person.id === id)!);
  const remainingSec = Math.ceil(scenario.workflow.rounds[state.roundIndex].durationSec * (1 - runtime.progress));

  // Zoom's Apps button opens and closes the app for whoever's screen is shown.
  const appOpen = view === "host" ? state.apps.host : view === "participant" ? state.apps.participant : state.apps.host && state.apps.participant;
  function toggleApps() {
    if (view !== "participant") dispatch({ kind: "openApp", role: "host", open: !appOpen });
    if (view !== "host") dispatch({ kind: "openApp", role: "participant", open: !appOpen });
  }

  const mainMeeting = (
    <MeetingSection
      label={inRooms ? "Main meeting · everyone else is in breakout rooms" : scenario.meetingTitle}
      compact={inRooms && view === "both"}
    >
      <Gallery
        people={inRooms ? [scenario.host] : everyone}
        hostId={scenario.host.id}
        youId={you}
        leavingIds={state.phase === "launching" ? everyone.filter((person) => person.id !== scenario.host.id).map((person) => person.id) : []}
      />
    </MeetingSection>
  );

  const breakoutRoom = (
    <MeetingSection
      label={`${room} · ${formatClock(remainingSec)} left · sped up`}
      action={runtime.canSkip ? <button type="button" className="dm-meeting__skip" onClick={runtime.skip}>Skip ahead ›</button> : null}
    >
      <Gallery people={roomPeople} hostId={scenario.host.id} youId={you} speech={state.speech} lastSaid={state.lastSaid} room />
      <p className="dm-meeting__caption">
        Simulated conversation. In a real session this is Zoom audio; Breakout Workspace never records it.
      </p>
    </MeetingSection>
  );

  return (
    <div className="dm-shell">
      <TopBar view={view} onViewChange={(next) => setPicked({ view: next, step: stepIndex })} onReplay={onReplay} onReset={onReset} />

      <div className={`dm-stage dm-stage--${view}${step ? ` dm-stage--focus-${step.target}` : ""}`}>
        {view !== "participant" && state.apps.host ? (
          <AppPanel role="host" person={scenario.host}>
            <HostApp
              scenario={scenario}
              state={state}
              progress={runtime.progress}
              remainingSec={remainingSec}
              onLaunch={runtime.launch}
              onEnd={runtime.end}
              onGenerate={() => dispatch({ kind: "generate" })}
              onUseWorkflow={() => dispatch({ kind: "useWorkflow" })}
              onOpenRoom={(nextRoom) => dispatch({ kind: "openRoom", room: nextRoom })}
            />
          </AppPanel>
        ) : null}

        <div className="dm-meeting">
          {/* The host stays in the main meeting; the visitor sees their own room. */}
          {!inRooms || view !== "participant" ? mainMeeting : null}
          {inRooms && view !== "host" ? breakoutRoom : null}
        </div>

        {view !== "host" && state.apps.participant ? (
          <AppPanel role="participant" person={scenario.visitor}>
            <ParticipantApp
              scenario={scenario}
              state={state}
              onTick={(item) => dispatch({ kind: "tick", by: scenario.visitor.id, item })}
              onAnswer={(text) => dispatch({ kind: "answer", by: scenario.visitor.id, text, visitor: true })}
              onNote={(text) => dispatch({ kind: "note", by: scenario.visitor.id, text, visitor: true })}
            />
          </AppPanel>
        ) : null}
      </div>

      <Toolbar
        participantCount={everyone.length}
        appsOpen={appOpen}
        appsPulse={step?.until === "hostAppOpened" || step?.until === "participantAppOpened"}
        onApps={toggleApps}
      />

      {step ? (
        <TourCard
          key={stepIndex}
          step={step}
          index={stepIndex}
          total={scenario.tour.length}
          onNext={() => setStepFloor(stepIndex + 1)}
          onClose={onTourClose}
        />
      ) : null}
    </div>
  );
}

/** One meeting area: a label bar (with an optional action) over a gallery. */
function MeetingSection({ label, action, compact, children }: { label: string; action?: ReactNode; compact?: boolean; children: ReactNode }) {
  return (
    <section className={`dm-meeting__section${compact ? " dm-meeting__section--compact" : ""}`} aria-label={label}>
      <header className="dm-meeting__bar">
        <span className="dm-meeting__title">{label}</span>
        {action}
      </header>
      {children}
    </section>
  );
}
