import assert from "node:assert/strict";
import test from "node:test";

import { rebalanceEvenly, shuffleEvenly } from "../lib/room-plan-assignments.ts";
import { groupsForLaunch } from "../lib/room-plan-copy.ts";
import type { RoundPlanDraft } from "../types/breakout.ts";

function draftWith(rooms: string[][], stayInMain: string[] = []): RoundPlanDraft {
  return {
    parentUUID: "meeting",
    roundId: "round-1",
    title: "Round 1",
    rooms: rooms.map((people, index) => ({
      id: `room-${index + 1}`,
      name: `Room ${index + 1}`,
      dot: "#fcb900",
      participantUUIDs: people,
    })),
    stayInMainParticipantUUIDs: stayInMain,
  } as RoundPlanDraft;
}

const sizes = (draft: RoundPlanDraft) => draft.rooms.map((room) => room.participantUUIDs.length);

test("a room added after the first spread gets its share", () => {
  const people = ["a", "b", "c", "d", "e", "f"];
  const result = rebalanceEvenly(draftWith([["a", "b", "c"], ["d", "e", "f"], []]), people);
  assert.deepEqual(sizes(result), [2, 2, 2]);
});

test("people keep their room when it is not over its size", () => {
  const result = rebalanceEvenly(draftWith([["a", "b", "c", "d"], ["e"]]), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(result.rooms[0].participantUUIDs, ["a", "b", "c"]);
  assert.deepEqual(result.rooms[1].participantUUIDs, ["e", "d"]);
});

test("newcomers fill the smaller rooms and sizes differ by at most one", () => {
  const result = rebalanceEvenly(draftWith([["a"], [], []]), ["a", "b", "c", "d", "e", "f", "g"]);
  assert.deepEqual(sizes(result), [3, 2, 2]);
  assert.ok(result.rooms[0].participantUUIDs.includes("a"));
});

test("people kept in main and absent planned people stay where they are", () => {
  const result = rebalanceEvenly(draftWith([["gone", "a", "b"], []], ["m"]), ["a", "b", "m"]);
  assert.deepEqual(result.stayInMainParticipantUUIDs, ["m"]);
  assert.deepEqual(result.rooms[0].participantUUIDs, ["gone", "a"]);
  assert.deepEqual(result.rooms[1].participantUUIDs, ["b"]);
});

test("shuffle deals everyone present evenly and leaves people kept in main", () => {
  let seed = 0.3;
  const random = () => (seed = (seed * 9301 + 0.49297) % 1);
  const result = shuffleEvenly(draftWith([["a", "b", "c"], ["d"], []], ["m"]), ["a", "b", "c", "d", "e", "m"], random);
  assert.deepEqual(sizes(result), [2, 2, 1]);
  assert.deepEqual(result.stayInMainParticipantUUIDs, ["m"]);
  assert.deepEqual(result.rooms.flatMap((room) => room.participantUUIDs).sort(), ["a", "b", "c", "d", "e"]);
});

test("groups for launch copy the last round and drop people who left", () => {
  const source = draftWith([["a", "gone"], ["b"]], ["m"]);
  const target = { parentUUID: "meeting", roundId: "round-2", title: "Round 2" };
  const result = groupsForLaunch(source, target, new Set(["a", "b"]));
  assert.equal(result.roundId, "round-2");
  assert.deepEqual(result.rooms.map((room) => room.participantUUIDs), [["a"], ["b"]]);
  assert.deepEqual(result.stayInMainParticipantUUIDs, []);
  assert.deepEqual(groupsForLaunch(source, target, null).rooms[0].participantUUIDs, ["a", "gone"]);
});
