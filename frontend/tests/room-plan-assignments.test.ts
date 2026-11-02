import assert from "node:assert/strict";
import test from "node:test";

import { settleForLaunch, shuffleEvenly } from "../lib/room-plan-assignments.ts";
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

test("assign evenly deals everyone present evenly and leaves people kept in main", () => {
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

test("settle for launch keeps the groups, drops leavers and puts latecomers in the smallest room", () => {
  const plan = draftWith([["a", "b", "gone"], ["c"]], ["m", "left-main"]);
  const result = settleForLaunch(plan, ["a", "b", "c", "late", "m"]);
  assert.deepEqual(result.rooms.map((room) => room.participantUUIDs), [["a", "b"], ["c", "late"]]);
  assert.deepEqual(result.stayInMainParticipantUUIDs, ["m"]);
});

test("settle for launch deals everyone present when nobody was placed", () => {
  const result = settleForLaunch(draftWith([[], []], ["m"]), ["a", "b", "c", "m"]);
  assert.deepEqual(sizes(result), [2, 1]);
  assert.deepEqual(result.rooms.flatMap((room) => room.participantUUIDs).sort(), ["a", "b", "c"]);
  assert.deepEqual(result.stayInMainParticipantUUIDs, ["m"]);
});
