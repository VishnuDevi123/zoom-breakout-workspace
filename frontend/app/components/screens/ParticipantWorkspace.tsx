"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { memberStatus } from "@/lib/activity-kinds";
import { roomMembers } from "@/lib/participant-status";
import { CHALLENGE_KINDS } from "@/lib/challenges";
import { useRemainingSec } from "@/lib/round-clock";
import { roomTheme } from "@/lib/room-theme";
import { useRoomChallenge } from "@/lib/use-challenges";
import type { ParticipantRound } from "@/lib/use-participant-round";
import { useRoomResponses } from "@/lib/use-room-responses";
import { useRoomStatus } from "@/lib/use-room-status";
import type { LiveState, PlannedRoom } from "@/types/breakout";

import ActivityCards from "../ActivityCards";
import AnswerModal from "../AnswerModal";
import ChallengeOverlay from "../ChallengeOverlay";
import PageFrame from "../PageFrame";
import RoomBar from "../RoomBar";
import RoomPeople from "../RoomPeople";
import RoomStatusPicker from "../RoomStatusPicker";
import RoomStatusReminder from "../RoomStatusReminder";
import SharedChecklist from "../SharedChecklist";
import TaskDetails from "../TaskDetails";
import { Button } from "../ui";
import ActivityPage from "./ActivityPage";

/** In the round's last minute the room is reminded to tell the host if it needs more time. */
const REMINDER_SEC = 60;

/**
 * The room a participant works in for one round, in the host's live frame with
 * a lighter bar: the "Tell your host" status strip across the top, then the task,
 * instructions, resources and activities on the left (70%), and the shared
 * checklist and the room's people on the right (30%). Opening an activity swaps the whole page for that activity until
 * the participant goes back.
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

  // The host's latest poll or quiz. It opens by itself when launched and again when revealed;
  // closing it keeps a banner on the room page until the reveal.
  const { challenge, answer } = useRoomChallenge({
    parentUUID: live?.parentUUID ?? "",
    roundId,
    roomId: room.id,
    participantUUID,
    refreshKey: `${live?.challengeRevision ?? 0}:${live?.roomRevisions[room.id] ?? 0}`,
  });
  const [introDoneFor, setIntroDoneFor] = useState<string | null>(null);
  const [seenRunning, setSeenRunning] = useState<string | null>(null);
  const [closedKey, setClosedKey] = useState<string | null>(null);
  if (challenge && !challenge.revealed && seenRunning !== challenge.id) setSeenRunning(challenge.id);
  const challengeKey = challenge ? `${challenge.id}:${challenge.revealed}` : null;
  // Results open by themselves only for a room that saw it running, not for someone arriving later.
  const challengeShown =
    challenge !== null && (!challenge.revealed || seenRunning === challenge.id) && closedKey !== challengeKey;
  const overlay =
    challenge?.room && challengeShown ? (
      <ChallengeOverlay
        challenge={challenge}
        answers={challenge.room}
        roomId={room.id}
        roomName={room.name}
        roomDot={room.dot}
        participants={live?.participants ?? []}
        participantUUID={participantUUID}
        intro={!challenge.revealed && introDoneFor !== challenge.id}
        onIntroDone={setIntroDoneFor}
        onAnswer={answer}
        onClose={() => setClosedKey(challengeKey)}
      />
    ) : null;

  const roomStatus = useRoomStatus({ live, roomId: room.id, participantUUID });
  const endsAt = live?.round?.endsAt ?? 0;
  const remainingSec = useRemainingSec(endsAt);
  // Once per end time, so time the host adds and a second last minute remind again.
  // A room already done needs no reminder; an open answer is never covered by a second modal.
  const reminderKey = `${roundId}:${endsAt}`;
  const reminderDue =
    remainingSec !== null && remainingSec > 0 && remainingSec <= REMINDER_SEC && roomStatus.current !== "done";
  const [reminding, setReminding] = useState(false);
  const [remindedKey, setRemindedKey] = useState<string | null>(null);
  if (reminderDue && remindedKey !== reminderKey && openActivity?.kind !== "individual" && !challengeShown && !reminding) {
    setRemindedKey(reminderKey);
    setReminding(true);
  }
  if (reminding && !live?.round) setReminding(false);
  const reminder = reminding ? (
    <RoomStatusReminder
      current={roomStatus.current}
      onChoose={(status) => void roomStatus.choose(status)}
      onClose={() => setReminding(false)}
    />
  ) : null;

  // The shared board is a page of its own; an individual answer opens as a modal over this page.
  if (openActivity?.kind === "ideaBoard") {
    return (
      <>
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
        {reminder}
        {overlay}
      </>
    );
  }

  return (
    <>
      <PageFrame
        tone="participant"
        style={roomTheme(room.dot)}
        bar={<RoomBar room={room} live={live} onHome={onBack} />}
      >
        <div className="bw-room-page">
          {challenge && !challenge.revealed && !challengeShown ? (
            <div className="bw-challenge-strip bw-swap-in">
              <span className={`bw-challenge-badge bw-challenge-badge--${challenge.kind}`}>{CHALLENGE_KINDS[challenge.kind].label}</span>
              <div className="bw-challenge-strip__text">
                <span className="bw-challenge-strip__title" title={challenge.title}>{challenge.title}</span>
                <span className="bw-challenge-strip__hint">Your room answers together.</span>
              </div>
              <div className="bw-challenge-strip__actions">
                <Button size="sm" onClick={() => setClosedKey(null)}>
                  Open
                </Button>
              </div>
            </div>
          ) : null}
          {live?.round ? (
            <RoomStatusPicker current={roomStatus.current} onChoose={(status) => void roomStatus.choose(status)} />
          ) : null}
          <div className="bw-room-layout">
            <section className="bw-session__column">
              <TaskDetails
                heading="Your task this round"
                task={task}
                emptyText="Your host has not written a task for this round. It appears here as soon as they do."
              />

              <ActivityCards
                activities={activities}
                view={view}
                participantUUID={participantUUID}
                onOpen={(activity) => setOpenActivityId(activity.id)}
              />
            </section>

            <div className="bw-session__column">
              {task && task.checklist.length > 0 ? (
                <SharedChecklist items={task.checklist} view={view} onTick={(itemId, done) => void setTick(itemId, done)} />
              ) : null}
              <RoomPeople heading="In this room" people={people} />
            </div>
          </div>
        </div>
      </PageFrame>
      {openActivity?.kind === "individual" ? (
        <AnswerModal activity={openActivity} responses={responses} onClose={() => setOpenActivityId(null)} />
      ) : null}
      {reminder}
      {overlay}
    </>
  );
}
