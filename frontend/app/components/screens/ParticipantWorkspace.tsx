"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { memberStatus } from "@/lib/activity-kinds";
import { roomMembers } from "@/lib/participant-status";
import type { ParticipantRound } from "@/lib/use-participant-round";
import { useRoomResponses } from "@/lib/use-room-responses";
import type { LiveState, PlannedRoom } from "@/types/breakout";

import ActivityCards from "../ActivityCards";
import AnswerModal from "../AnswerModal";
import PageFrame from "../PageFrame";
import RoomBar from "../RoomBar";
import RoomPeople from "../RoomPeople";
import SharedChecklist from "../SharedChecklist";
import { Card, SectionLabel } from "../ui";
import ActivityPage from "./ActivityPage";

/**
 * The room a participant works in for one round, in the host's live frame with
 * a lighter bar: the task, instructions, resources and activities on the left
 * (70%), the room's people and the shared checklist on the right (30%). Opening
 * an activity swaps the whole page for that activity until the participant goes back.
 */
export default function ParticipantWorkspace({
  round,
  room,
  live,
  participantUUID,
  onBack,
}: {
  round: ParticipantRound;
  room: PlannedRoom;
  live: LiveState | null;
  participantUUID: string;
  onBack: () => void;
}) {
  const { task, activities } = round;
  const roundId = live?.round?.roundId ?? "";
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const responses = useRoomResponses({
    parentUUID: live?.parentUUID ?? "",
    roundId,
    roomId: room.id,
    participantUUID,
    roomRevision: live?.roomRevisions[room.id] ?? 0,
  });
  const { view, setTick } = responses;
  const openIndex = activities.findIndex((activity) => activity.id === openActivityId);

  // The host removed the open activity: the cards show again (no match below),
  // and the toast says why. The stale id is replaced on the next Open.
  const removedWhileOpen = openActivityId !== null && openIndex === -1;
  useEffect(() => {
    if (removedWhileOpen) toast("Your host removed that activity.");
  }, [removedWhileOpen]);
  const people = roomMembers({ room, live, participantUUID }).map(({ participantUUID: uuid, name }) => {
    const status = activities.length > 0 ? memberStatus(activities, view, uuid) : null;
    return { participantUUID: uuid, name, status, done: status === "Submitted" };
  });

  const openActivity = openIndex === -1 ? null : activities[openIndex];

  // The shared board is a page of its own; an individual answer opens as a modal over this page.
  if (openActivity?.kind === "ideaBoard") {
    return (
      <ActivityPage
        activity={openActivity}
        room={room}
        live={live}
        participantUUID={participantUUID}
        checklist={task?.checklist ?? []}
        responses={responses}
        onBack={() => setOpenActivityId(null)}
        onHome={onBack}
      />
    );
  }

  return (
    <>
      <PageFrame
        tone="participant"
        bar={<RoomBar room={room} live={live} onHome={onBack} />}
      >
        <div className="bw-room-layout">
          <section className="bw-session__column">
            <SectionLabel>Your task this round</SectionLabel>
            <Card className="bw-room-task">
              {task ? (
                <h2 className="bw-task-goal">{task.goal}</h2>
              ) : (
                <p className="bw-task-empty">
                  Your host has not written a task for this round. It appears here as soon as they do.
                </p>
              )}
            </Card>

            {task && task.instructions.length > 0 ? (
              <>
                <SectionLabel>Instructions</SectionLabel>
                <Card className="bw-instruction-list">
                  {task.instructions.map((line, index) => (
                    <div className="bw-instruction-row" key={line}>
                      <span className="bw-mono bw-instruction-row__number">{index + 1}</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </Card>
              </>
            ) : null}

            {task && task.resources.length > 0 ? (
              <>
                <SectionLabel>Resources from the host</SectionLabel>
                {task.resources.map((resource) => (
                  <ResourceRow key={resource} resource={resource} />
                ))}
              </>
            ) : null}

            <ActivityCards
              activities={activities}
              view={view}
              participantUUID={participantUUID}
              onOpen={(activity) => setOpenActivityId(activity.id)}
            />
          </section>

          <div className="bw-session__column">
            <RoomPeople heading="In this room" people={people} />
            {task && task.checklist.length > 0 ? (
              <SharedChecklist items={task.checklist} view={view} onTick={(itemId, done) => void setTick(itemId, done)} />
            ) : null}
          </div>
        </div>
      </PageFrame>
      {openActivity?.kind === "individual" ? (
        <AnswerModal activity={openActivity} responses={responses} onClose={() => setOpenActivityId(null)} />
      ) : null}
    </>
  );
}

/**
 * One host-supplied link. A resource is stored as a plain string, so anything
 * that is not a URL is shown as text rather than as a dead link.
 */
function ResourceRow({ resource }: { resource: string }) {
  const isLink = /^https?:\/\//i.test(resource);

  if (!isLink) {
    return (
      <div className="bw-resource-row">
        <span className="bw-resource-row__mark" />
        <span className="bw-resource-row__label">{resource}</span>
      </div>
    );
  }

  return (
    <a className="bw-resource-row" href={resource} target="_blank" rel="noreferrer">
      <span className="bw-resource-row__mark" />
      <span className="bw-resource-row__label">{resource}</span>
      <span className="bw-resource-row__open">Open</span>
    </a>
  );
}
