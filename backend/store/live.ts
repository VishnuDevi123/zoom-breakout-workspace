import {
  type LiveParticipant,
  type RoomLink,
  type LiveState,
  type RosterEntry,
  type SetRoomStatusRequest,
} from "../types/breakout.ts";
import { changeItem, readItem } from "../services/dynamo.ts";
import { getRoundPlan, moveToPlannedRoom } from "./round-plans.ts";

// The meeting's live record (item "live"): who is where, the running round and the
// counters clients refetch on. Webhooks and the live routes change it; every change
// is pushed to the meeting's SSE streams on this instance.

interface LiveRecord extends Omit<LiveState, "parentUUID"> {
    /** Where someone was when a participant_left arrived, kept to undo it if it was a room hop's ghost. */
    recentLeaves: Record<string, { location: string; at: number }>;
    /** Zoom user id -> who they are in this meeting, from webhooks. Never sent to clients. */
    people?: Record<string, Person>;
}

/** One signed-in user: every participantUUID they joined with (a rejoin adds one) and their last role change. */
export interface Person {
    participantUUIDs: string[];
    roleChangedAt: number;
}

/**
 * A room-to-room move sends a ghost participant_left ("left the meeting") and a
 * ghost participant_joined about 30 ms apart (verified 2026-11-02). A joined this
 * soon after a left from a room puts the person back where they were.
 */
const GHOST_HOP_MS = 3000;
const listeners = new Map<string, Set<(state: LiveState) => void>>();

function emptyLive(): LiveRecord {
    return { round: null, participants: [], taskRevision: 0, roomRevisions: {}, planRevision: 0, challengeRevision: 0, recentLeaves: {} };
}

function stateOf(parentUUID: string, live: LiveRecord = emptyLive()): LiveState {
    const { round, participants, taskRevision, roomRevisions, planRevision, challengeRevision } = live;
    return { parentUUID, round, participants, taskRevision, roomRevisions, planRevision, challengeRevision };
}

export async function getLive(parentUUID: string): Promise<LiveState> {
    return stateOf(parentUUID, await readItem<LiveRecord>(parentUUID, "live"));
}

export async function personOf(parentUUID: string, uid: string): Promise<Person | undefined> {
    return (await readItem<LiveRecord>(parentUUID, "live"))?.people?.[uid];
}

// register listener; return unsubscribe function.
export function subscribe(parentUUID: string, fn: (state: LiveState) => void): () => void {
    const set = listeners.get(parentUUID) ?? new Set(); set.add(fn); listeners.set(parentUUID, set)
    return () => set.delete(fn)
}

/**
 * Runs one change on the live record (one at a time per meeting) and pushes the
 * result to every stream. `change` returns false when it changed nothing, and so does this.
 */
async function changeLive(
    parentUUID: string,
    change: (live: LiveRecord) => boolean | Promise<boolean>,
): Promise<{ state: LiveState; changed: boolean }> {
    let changed = false
    const saved = await changeItem<LiveRecord>(parentUUID, "live", async (current) => {
        const live = current ?? emptyLive()
        changed = await change(live)
        return changed ? live : null
    })
    const state = stateOf(parentUUID, saved)
    if (changed) for (const fn of listeners.get(parentUUID) ?? []) fn(state)
    return { state, changed }
}

// Tasks live in store/tasks.ts; this only tells SSE clients that something changed.
export async function bumpTaskRevision(parentUUID: string): Promise<void> {
    await changeLive(parentUUID, (live) => { live.taskRevision += 1; return true })
}

/** Called on every response write in one room; that room's participants refetch their board. */
export async function bumpRoomRevision(parentUUID: string, roomId: string): Promise<void> {
    await changeLive(parentUUID, (live) => {
        live.roomRevisions[roomId] = (live.roomRevisions[roomId] ?? 0) + 1
        return true
    })
}

/** Called when the host launches or reveals a poll or quiz; every client refetches it. */
export async function bumpChallengeRevision(parentUUID: string): Promise<void> {
    await changeLive(parentUUID, (live) => { live.challengeRevision += 1; return true })
}

/**
 * Add or remove time on the running round. Negative seconds shorten it.
 * Returns null when no round is running, or when the round was launched with no
 * timer at all: that is a deliberate "runs until the host ends it", not a zero.
 */
export async function extendRound(parentUUID: string, seconds: number): Promise<LiveState | null> {
    const { state, changed } = await changeLive(parentUUID, (live) => {
        if (!live.round?.endsAt) return false
        // Never land in the past: shortening past now ends the round on the next tick.
        live.round.endsAt = Math.max(Date.now() + 1000, live.round.endsAt + seconds * 1000)
        return true
    })
    return changed ? state : null
}

/** Why a room status tap was refused, or the new state. */
export type RoomStatusResult =
    | { kind: "saved"; state: LiveState }
    | { kind: "notRunning" }
    | { kind: "notInRoom" }

/**
 * One tap on a room's status buttons. Anyone the plan places in the room may set
 * it, the latest tap wins, and "onTrack" clears the entry. Only the running round
 * takes a tap, so a late one cannot mark the next round's room.
 */
export async function setRoomStatus(request: SetRoomStatusRequest): Promise<RoomStatusResult> {
    const { parentUUID, roundId, roomId, participantUUID, status } = request
    // Same rule as response writes: the host's plan is the only record of who is in which room.
    const room = (await getRoundPlan(parentUUID, roundId))?.rooms.find((candidate) => candidate.id === roomId)
    if (!room || !room.participantUUIDs.includes(participantUUID)) return { kind: "notInRoom" }

    const { state, changed } = await changeLive(parentUUID, (live) => {
        if (live.round?.roundId !== roundId) return false
        if (status === "onTrack") {
            delete live.round.roomStatus[roomId]
        } else {
            live.round.roomStatus[roomId] = status
        }
        return true
    })
    return changed ? { kind: "saved", state } : { kind: "notRunning" }
}

/** Null when the round has no saved plan. */
export async function markLaunchedRound(parentUUID: string, roundId: string, durationSec: number): Promise<LiveState | null> {
    const plan = await getRoundPlan(parentUUID, roundId)
    if (!plan) return null
    const { state } = await changeLive(parentUUID, async (live) => {
        // endsAt 0 means no timer: the round runs until the host closes it.
        const endsAt = durationSec > 0 ? Date.now() + durationSec * 1000 : 0
        const roomUUIDs = Object.fromEntries(plan.rooms.map((room) => [room.id, null]))
        live.round = { roundId, roomUUIDs, endsAt, roomStatus: {} }
        // People Zoom moved before this report arrived (or before a lost report was
        // recovered) are already in a room; learn those rooms from them now.
        for (const p of live.participants) {
            if (p.location !== "main" && p.location !== "left") await learnRoom(live, parentUUID, p.participantUUID, p.location)
        }
        return true
    })
    return state
}

export async function markClosedRound(parentUUID: string): Promise<LiveState> {
    const { state } = await changeLive(parentUUID, (live) => {
        live.round = null
        // Zoom sends no participant_left_breakout_room on host close, only ghost joined/left pairs.
        for (const p of live.participants) {
            if (p.location !== "main" && p.location !== "left") p.location = "main"
        }
        return true
    })
    return state
}

/**
 * Presence from the Zoom SDK, read by the host when the app opens. Webhooks never
 * replay, so anyone who joined while the backend could not hear them is missing until this runs.
 *
 * The roster is the whole meeting: anyone not in it has left and is dropped. A
 * participant webhooks already placed keeps that location, because the SDK's room
 * ids cannot be matched to the webhook ones; only newcomers take the roster's room.
 */
export async function applyRoster(parentUUID: string, entries: RosterEntry[]): Promise<LiveState> {
    const { state } = await changeLive(parentUUID, (live) => {
        const present = new Set(entries.map((entry) => entry.participantUUID))
        live.participants = live.participants.filter((p) => present.has(p.participantUUID))
        for (const entry of entries) {
            const person = live.participants.find((p) => p.participantUUID === entry.participantUUID)
            // The room list marks only the host, so the roster may raise a role but never lower one.
            const role = entry.role !== "attendee" ? entry.role : (person?.role ?? "attendee")
            // A room's webhook uuid is only known once someone has entered it; until then "main".
            const location = (entry.roomId && live.round?.roomUUIDs[entry.roomId]) || "main"
            if (!person) live.participants.push({ participantUUID: entry.participantUUID, name: entry.name, role, location })
            else Object.assign(person, person.location === "left" ? { name: entry.name, role, location } : { role })
        }
        return true
    })
    return state
}

// Zoom webhook body. Only the fields we read; Zoom owns the full shape.
interface WebhookBody {
    event?: string;
    event_ts?: number;
    payload?: {
        object?: {
            uuid?: string;
            host_id?: string;
            breakout_room_uuid?: string;
            participant?: {
                id?: string;
                participant_uuid?: string;
                /** The token's uid; absent for guests. */
                participant_user_id?: string;
                user_name?: string;
                leave_reason?: string;
                new_role?: string;
            };
        };
    };
}

// The first planned person to enter a Zoom room tells us that room's webhook uuid.
async function learnRoom(live: LiveRecord, parentUUID: string, participantUUID: string, roomUUID: string): Promise<void> {
    if (!live.round) return
    const plan = await getRoundPlan(parentUUID, live.round.roundId)
    const room = plan?.rooms.find((r) => r.participantUUIDs.includes(participantUUID))
    // A Zoom room already linked to another planned room was linked by its own people or by the host's room list.
    const linked = Object.values(live.round.roomUUIDs).includes(roomUUID)
    if (room && live.round.roomUUIDs[room.id] === null && !linked) {
        live.round.roomUUIDs[room.id] = roomUUID
    }
}

/**
 * Someone Zoom reports in a linked room the plan does not put them in was moved
 * there (Zoom's Breakout Rooms window, or Move in this app). The running round's
 * plan follows, so their room page, the room cards and "Same groups" agree with Zoom.
 * The host and co-hosts visit rooms on their own and are never placed.
 */
async function followMove(live: LiveRecord, parentUUID: string, participant: LiveParticipant): Promise<void> {
    const round = live.round
    if (!round || participant.role !== "attendee") return
    const roomId = Object.keys(round.roomUUIDs).find((id) => round.roomUUIDs[id] === participant.location)
    if (!roomId) return
    if (await moveToPlannedRoom(parentUUID, round.roundId, participant.participantUUID, roomId)) live.planRevision += 1
}

/**
 * Links read by the host from Zoom's room list (matched by room name). They win
 * over a link learned from webhooks, which can be wrong when the first person in
 * a room was moved there. Refused (null) when the round is not the running one.
 */
export async function linkRooms(parentUUID: string, roundId: string, links: RoomLink[]): Promise<LiveState | null> {
    const { state, changed } = await changeLive(parentUUID, async (live) => {
        const round = live.round
        if (!round || round.roundId !== roundId) return false
        for (const { roomId, roomUUID } of links) {
            if (!(roomId in round.roomUUIDs)) continue
            for (const id of Object.keys(round.roomUUIDs)) {
                if (round.roomUUIDs[id] === roomUUID) round.roomUUIDs[id] = null
            }
            round.roomUUIDs[roomId] = roomUUID
        }
        for (const participant of live.participants) await followMove(live, parentUUID, participant)
        return true
    })
    return changed ? state : null
}

// Update one participant's location from a webhook event.
// Entering a breakout room also fires participant_left (reason mentions "breakout")
// and a participant_joined with a new user_id; both are ignored by the rules below.
export async function applyEvent(body: unknown): Promise<void> {
    const { event, event_ts: at = Date.now(), payload } = body as WebhookBody
    const object = payload?.object
    const parentUUID = object?.uuid
    const participant = object?.participant
    const participantUUID = participant?.participant_uuid
    if (!event || !parentUUID || !participantUUID) return

    await changeLive(parentUUID, async (live) => {
        const uid = participant?.participant_user_id
        // Records written before people existed have none (deployment rule: read old records).
        const person = uid ? ((live.people ??= {})[uid] ??= { participantUUIDs: [], roleChangedAt: 0 }) : null
        if (person && !person.participantUUIDs.includes(participantUUID)) person.participantUUIDs.push(participantUUID)
        const known = live.participants.find((p) => p.participantUUID === participantUUID)
        const entry: LiveParticipant = known ?? {
            participantUUID,
            name: participant?.user_name ?? "",
            role: Boolean(participant?.id) && participant?.id === object?.host_id ? "host" : "attendee",
            location: "main",
        }

        switch (event) {
            case "meeting.participant_joined_breakout_room":
                if (!object?.breakout_room_uuid) return false
                entry.location = object.breakout_room_uuid
                await learnRoom(live, parentUUID, participantUUID, object.breakout_room_uuid)
                await followMove(live, parentUUID, entry)
                break
            case "meeting.participant_left_breakout_room":
                entry.location = "main"
                break
            case "meeting.participant_joined": {
                const leave = live.recentLeaves[participantUUID]
                delete live.recentLeaves[participantUUID]
                if (entry.location !== "left" && known) break
                const hop = leave && at - leave.at <= GHOST_HOP_MS && leave.location !== "main" && leave.location !== "left"
                entry.location = hop ? leave.location : "main"
                break
            }
            case "meeting.participant_role_changed":
                if (person) person.roleChangedAt = at
                // Zoom says "co-host"; the SDK and this app say "coHost".
                entry.role = participant?.new_role === "host" ? "host" : participant?.new_role === "co-host" ? "coHost" : "attendee"
                break
            case "meeting.participant_left":
                if (participant?.leave_reason?.includes("breakout")) return false
                live.recentLeaves[participantUUID] = { location: entry.location, at }
                entry.location = "left"
                break
            default:
                return false
        }

        if (!known) live.participants.push(entry)
        return true
    })
}
