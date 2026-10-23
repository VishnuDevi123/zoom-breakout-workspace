import assert from "node:assert/strict";
import test from "node:test";

import { roleSuffix, roomMembers } from "../lib/participant-status.ts";
import type { LiveParticipant, LiveState, PlannedRoom } from "../types/breakout.ts";

const room: PlannedRoom = { id: "room-a", name: "Room 1", dot: "#fcb900", participantUUIDs: ["me", "ann", "bo"] };

function person(participantUUID: string, location: string): LiveParticipant {
  return { participantUUID, name: participantUUID.toUpperCase(), role: "attendee", location };
}

function liveWith(participants: LiveParticipant[], roomUUID: string | null): LiveState {
  return {
    parentUUID: "meeting",
    round: { roundId: "round-1", roomUUIDs: { "room-a": roomUUID }, endsAt: 0, timerEnded: false },
    participants,
    taskRevision: 0,
    roomRevisions: {},
  };
}

test("before Zoom reports the room, everyone planned is listed", () => {
  const members = roomMembers({ room, live: liveWith([person("ann", "main")], null), participantUUID: "me" });
  assert.deepEqual(
    members.map((m) => m.name),
    ["You", "ANN", "Participant"],
  );
});

test("once the room is known, only people inside it are listed, plus the caller", () => {
  const live = liveWith([person("me", "zoom-a"), person("ann", "zoom-a"), person("bo", "main")], "zoom-a");
  assert.deepEqual(
    roomMembers({ room, live, participantUUID: "me" }).map((m) => m.participantUUID),
    ["me", "ann"],
  );
});

test("someone placed mid-round shows up before the caller's plan copy lists them", () => {
  const live = liveWith([person("me", "zoom-a"), person("cy", "zoom-a")], "zoom-a");
  assert.deepEqual(
    roomMembers({ room, live, participantUUID: "me" }).map((m) => m.participantUUID),
    ["me", "cy"],
  );
});

test("role suffix names host and co-host only", () => {
  assert.equal(roleSuffix("host"), " · host");
  assert.equal(roleSuffix("coHost"), " · co-host");
  assert.equal(roleSuffix("attendee"), "");
});
