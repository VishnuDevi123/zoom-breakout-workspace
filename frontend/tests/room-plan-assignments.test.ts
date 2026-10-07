import assert from "node:assert/strict";
import test from "node:test";

import { rebalanceEvenly } from "../lib/room-plan-assignments.ts";
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
