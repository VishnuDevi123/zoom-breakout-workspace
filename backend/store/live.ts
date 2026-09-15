import {
    type LiveParticipant,
    type LiveRound,
    type LiveState,
} from "../types/breakout.ts"; 
import {getRoundPlan } from "./round-plans.ts";

// tracking the current live state participant, rooms and rounds and push any updates to the store

interface LiveMeeting{
    round: LiveRound | null;
    participants: Map<string, LiveParticipant>;
}
// live state is stored in memory, so it will be lost on backend restart. 
const live = new Map<string, LiveMeeting>();
const listeners = new Map<string, Set<(state: LiveState) => void>>();


// get-or-create. Same pattern as recordFor() in sessions.ts.
function meetingFor(parentUUID: string): LiveMeeting{
    if (!live.has(parentUUID)){
        live.set(parentUUID, {
            round: null,
            participants: new Map(),
        });
    }
    return live.get(parentUUID)!;
}
  

export function getLive(parentUUID: string): LiveState{
    const liveMeeting = meetingFor(parentUUID)
    return { parentUUID, round: liveMeeting.round, participants: [...liveMeeting.participants.values()] }
}


// call every listener for this meeting with fresh state after any change, call every subscribed function with getLive() result.
function notify(parentUUID: string): void {
    const currentState = getLive(parentUUID)
    for (const fn of listeners.get(parentUUID) ?? []) {
        fn(currentState)
    }
}

// register listener; return unsubscribe function.
export function subscribe(parentUUID: string, fn: (state: LiveState) => void): () => void {
    const set = listeners.get(parentUUID) ?? new Set(); set.add(fn); listeners.set(parentUUID, set)
    return () => set.delete(fn)

}

export function markLaunchedRound(parentUUID: string, roundId: string): LiveState | null {
    const plan = getRoundPlan(parentUUID, roundId)
    // if getRoundPlan returns undefined, it means the round plan does not exist for the given parentUUID and roundId. In that case return null to indicate that there is no live round to mark as lauched
    if (!plan) {
        return null
    }
    const roomUUIDs: LiveRound["roomUUIDs"] = {}
    for (const room of plan.rooms) {
        roomUUIDs[room.id] = null
    }
    const meeting = meetingFor(parentUUID)
    meeting.round = { roundId, roomUUIDs }
    notify(parentUUID)
    return getLive(parentUUID)
}

export function markClosedRound(parentUUID: string): LiveState {
    const meeting = meetingFor(parentUUID)
    meeting.round = null
    notify(parentUUID)
    return getLive(parentUUID)
}

// Zoom webhook body. Only the fields we read; Zoom owns the full shape.
interface WebhookBody {
    event?: string;
    payload?: {
        object?: {
            uuid?: string;
            breakout_room_uuid?: string;
            participant?: {
                participant_uuid?: string;
                user_name?: string;
                leave_reason?: string;
            };
        };
    };
}

// First person from a planned room to enter a Zoom room tells us that room's webhook uuid.

// applyEvent will use learnRoom to update the live state with the roomUUID for a planned room when the first participant joins a breakout room. This is important because the live state needs to know which Zoom room corresponds to each planned room in order to accurately track participant locations and manage the breakout session effectively.
function learnRoom(meeting: LiveMeeting, parentUUID: string, participantUUID: string, roomUUID: string): void {
    if (!meeting.round) return
    const plan = getRoundPlan(parentUUID, meeting.round.roundId)
    if (!plan) return
    const room = plan.rooms.find((r) => r.participantUUIDs.includes(participantUUID))
    if (room && meeting.round.roomUUIDs[room.id] === null) {
        meeting.round.roomUUIDs[room.id] = roomUUID
    }
}

// Update one participant's location from a webhook event.
// Entering a breakout room also fires participant_left (reason mentions "breakout")
// and a participant_joined with a new user_id; both are ignored by the rules below.
export function applyEvent(body: unknown): void {
    const { event, payload } = body as WebhookBody
    const object = payload?.object
    const parentUUID = object?.uuid
    const participant = object?.participant
    const participantUUID = participant?.participant_uuid
    if (!event || !parentUUID || !participantUUID) return

    const meeting = meetingFor(parentUUID)
    const wasKnown = meeting.participants.has(participantUUID)
    const entry: LiveParticipant = meeting.participants.get(participantUUID) ?? {
        participantUUID,
        name: participant?.user_name ?? "",
        location: "main",
    }

    switch (event) {
        case "meeting.participant_joined_breakout_room":
            if (!object?.breakout_room_uuid) return
            entry.location = object.breakout_room_uuid
            learnRoom(meeting, parentUUID, participantUUID, object.breakout_room_uuid)
            break
        case "meeting.participant_left_breakout_room":
            entry.location = "main"
            break
        case "meeting.participant_joined":
            if (!wasKnown || entry.location === "left") entry.location = "main"
            break
        case "meeting.participant_left":
            if (participant?.leave_reason?.includes("breakout")) return
            entry.location = "left"
            break
        default:
            return
    }

    meeting.participants.set(participantUUID, entry)
    notify(parentUUID)
}
