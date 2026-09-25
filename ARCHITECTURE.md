# Architecture

Zoom App for planning and running breakout rounds. Next.js frontend runs inside the Zoom client and is the only thing that calls the Zoom Apps SDK. Express backend stores drafts, records launches, receives Zoom webhooks and pushes live state to the frontend over SSE. The backend never calls Zoom.

## Boundaries

Field lists live in `backend/types/breakout.ts`.

| Domain | Source of truth | Files |

-> Workspace (`Workspace`, `RoundMeta`) | `backend/store/workspace.ts`, one record per meeting | `backend/routes/workspace.ts`, `frontend/lib/use-workspace.ts`, `frontend/app/components/screens/RoundsOverview.tsx` |
-> Host navigation (landing -> rounds -> draft -> task, plus live whenever a round runs) | `HostView` state in `frontend/app/components/screens/HostWorkspace.tsx`; no URL routes | `LandingScreen.tsx`, `RoundsOverview.tsx`, `Rooms.tsx`, `TaskEditor.tsx`, `LiveRound.tsx` |
-> Round task (`RoundTasks`, `RoomTask`) | `backend/store/tasks.ts`, keyed `(parentUUID, roundId)` | `backend/routes/tasks.ts`, `frontend/lib/use-round-tasks.ts` (host, edits), `frontend/lib/use-participant-round.ts` (participant, reads), `frontend/app/components/TaskFields.tsx` shared by `screens/TaskEditor.tsx` and `EditTaskModal.tsx` |
-> Participant view | `LiveState` + the round's draft + the round's task; no SDK reads at all | `frontend/app/components/screens/ParticipantScreen.tsx` (landing, three states), `ParticipantWorkspace.tsx` (room page), `frontend/lib/use-participant-round.ts` |
-> Round timer (`LiveRound.endsAt`, `timerEnded`) | `backend/store/live.ts` `setTimeout` per meeting, pushed over SSE | `backend/routes/live.ts`, `frontend/app/components/LiveRound.tsx`, `frontend/app/components/screens/HostWorkspace.tsx` |
-> Round seeding (copy round 1 rooms/people into a round with no draft) | `frontend/lib/room-plan-copy.ts` pure function, `seed` param of `use-room-plan.ts` | `HostWorkspace.tsx` |
-> Round draft (`RoundPlan`) | `backend/store/round-plans.ts`, keyed `(parentUUID, roundId)` | `backend/routes/round-plans.ts`, `frontend/lib/use-room-plan.ts`, `frontend/lib/room-plan-assignments.ts`, `frontend/app/components/Rooms.tsx`; the overview writes the same drafts through `frontend/lib/execution-api.ts` `saveRoundPlan` and reads them all with `frontend/lib/use-round-summaries.ts`
-> Live state (`LiveState`: who is where, which round is live, planned room -> Zoom room UUID) | `backend/store/live.ts`, one record per meeting, fed by webhooks | `backend/routes/webhooks.ts`, `backend/routes/live.ts`, `frontend/lib/use-live-state.ts`, `frontend/app/components/LiveRound.tsx` |
-> Launch / close | Frontend SDK calls, then reported to backend | `frontend/lib/launch-round.ts`, `frontend/lib/use-live-room-controller.ts`, `frontend/lib/execution-api.ts` |
-> Host gate | `getUserContext().role` | `frontend/lib/host-gate.ts`, `frontend/app/components/ZoomClient.tsx` |
-> Zoom SDK bootstrap and typings | `frontend/lib/zoom-sdk.ts`, `frontend/types/zoom.d.ts` | |
-> Shared contracts | `backend/types/breakout.ts` is canonical; `frontend/types/breakout.ts` is an identical copy | |

## Data flow

```
workspace         frontend -> GET/PUT /api/workspace                    workspace store: title, toggle, round fields
add/remove round  frontend -> POST /api/workspace/rounds, DELETE /rounds/:roundId   workspace store (+ deletes that round's draft)
edit draft        frontend -> PUT  /api/rounds/:roundId/rooms          round-plans store; from the editor (debounced) or
                                                                      from the overview rail (one call per round)
edit task         host     -> GET/PUT /api/tasks/:roundId            tasks store; from the round's task page or, mid-round,
                                                                      from the panel over the live screen
                  backend  -> SSE  taskRevision + 1                    participants refetch the task; no task text on the stream
read task         participant -> GET /api/tasks/:roundId             rooms[myRoomId] ?? all
Launch Round N    frontend -> SDK createBreakoutRooms, assign*, configureBreakoutRooms, open
                  frontend -> POST /api/live/launch {parentUUID, roundId}   live store: round + endsAt + empty roomUUIDs, timer armed; workspace: status launched
+/- 1 min         frontend -> POST /api/live/extend {parentUUID, seconds}   live store: new endsAt, timer re-armed, timerEnded cleared
timer ends        backend  -> SSE  round.timerEnded = true                  frontend closes, then launches the next when autoStartNextRound
participant moves Zoom     -> POST /api/webhooks/zoom                     live store: participant.location, learnRoom()
push              backend  -> SSE  /api/live/events                       frontend setState -> UI
Close Round N     frontend -> SDK getBreakoutRoomList, closeBreakoutRooms when still open
                  frontend -> POST /api/live/close                          live store: round null, timer cleared, room-located people reset to "main"; workspace: status closed
```

## Identity rules

- Meeting key: `getMeetingUUID()` on the frontend == `payload.object.uuid` in webhooks. That call returns `{ meetingUUID, parentUUID? }`, and inside a breakout room `meetingUUID` is the **room**. Every store is keyed by `parentUUID ?? meetingUUID`, which `zoom-sdk.ts` resolves once for everybody.
- Participant key: `participant_uuid` / SDK `participantUUID`. Never `user_id` or `participantId`; Zoom reissues them on every room hop.
- Draft rooms use app-owned ids. Zoom room ids never enter the draft.
- Round ids are stable (`round-N`, next = highest + 1). Display position comes from array order, never the id. A null title means untitled; the UI shows "Round N" by position.
- SDK `breakoutRoomId` and webhook `breakout_room_uuid` are different values with no mapping API. `store/live.ts` learns `plannedRoom.id -> breakout_room_uuid` from the first assigned participant who enters. Reset on every launch.
- Host is `participant.id === object.host_id` in webhooks; launch skips assigning the host.

## Webhook event rules (`store/live.ts` `applyEvent`)

Entering a room emits three events; rules are order-independent. A host-initiated
close emits none of them, so `markClosedRound` resets locations instead.

| Event | Effect |
| --- | --- |
| `meeting.participant_joined_breakout_room` | `location = breakout_room_uuid`; learn room mapping |
| `meeting.participant_left_breakout_room` | `location = "main"` |
| `meeting.participant_joined` | `location = "main"` only if unknown or currently `"left"` |
| `meeting.participant_left` | ignore if `leave_reason` mentions "breakout"; else `location = "left"` |

## Rules

- Draft edits never mutate Zoom. Only Launch / Close do, from the frontend.
- Backend records what the frontend reports and what Zoom sends; it never verifies against Zoom.
- Do not poll the SDK for live state; webhooks are the source. Two reads are allowed, both one-shot: `getBreakoutRoomList()` when the app opens on a round the backend still calls live, and again before `closeBreakoutRooms` to skip a close Zoom does not need.
- The app owns the round clock. `configureBreakoutRooms` always sets `closeAfter: 0` and `countDown: 0`: Zoom reports nothing when its own timer fires, and a countdown blocks the next round's rooms. It runs **after** `createBreakoutRooms`, never before: configuring a room set that does not exist yet fails with `No Breakout Room exist.` on the first launch in a fresh meeting. `markLaunchedRound` and `extendRound` share one `armTimer` helper so the two cannot drift.
- `config()` runs in two stages. `BASE_CAPABILITIES` (`getMeetingUUID`, `getUserContext`) is all any role may request; everything else, including `getMeetingContext` and `onMyUserContextChange`, is host-only and is added by `grantHostCapabilities` once the role is known. Requesting a host capability as an attendee rejects the whole call with `reason:require_meeting_role`. Demotion clears the memo so a later promotion re-runs stage two.
- Tasks are never gated on round status: the same `PUT /api/tasks/:roundId` serves the planner and the live panel. The SSE stream carries only `taskRevision`, never the task text, so a change is a signal to refetch.
- A participant calls no breakout method and reads no Zoom state. Their room comes from the host's saved draft, matched on their own `participantUUID`.
- Zoom answers "busy" for a second or two after a close and after creating rooms; `launch-round.ts` waits it out rather than failing.
- Zoom is driven from two places only: `Launch Workflow` on the rounds overview, and End round / Launch next in the live view. The editor plans rounds and never touches Zoom.
- Never resolve a promise with the `zoomSdk` object itself (it is a Proxy; JS probes `.then`). Return `{ sdk }`.
- Extend existing stores/routes/hooks before adding new ones. Mirror type changes to both `types/breakout.ts` files.
- Workspace PUT edits round fields only; add/remove go through POST/DELETE `/rounds` so draft deletion happens in one place. `status` and `dot` are server-owned. A launched round cannot be deleted.
- Launch never gates on the workspace: `markRoundStatus` is a no-op for unknown rounds.
- After removing a path, delete its types, CSS and comments in the same change.

## Known limits

- All stores are in-memory `Map`s; server restart loses the workspace, drafts, tasks and live state. Zoom never replays webhooks, so anyone who joined before a restart stays invisible until they leave and rejoin. The fix (planned, not built) is a roster read from the SDK on app open: `getMeetingParticipants` when no round is live, `getBreakoutRoomList` when one is, posted to a new `/api/live/roster`. Presence only - the SDK's room ids still do not match the webhook uuids.
- A room's Zoom UUID is unknown until an assigned participant enters it.
- The round timer lives in the backend process. A restart loses it, and a round already open in Zoom keeps running with nothing to close it.
- Every entry in `ZOOM_CAPABILITIES` must stay ticked on the Marketplace API list, or `config()` fails with `reason:app_not_support`.
- An attendee cannot receive `onMyUserContextChange`: it is host-only. A demoted host is re-routed at once, but a promoted attendee must reopen the app.
- `getMeetingParticipants` called from inside a breakout room returns that room's people, not the meeting's. `getBreakoutRoomList` includes each room's participants only for the meeting **owner**; a co-host receives rooms with no people, which must not be read as an empty meeting.
- One task per round. The store holds per-room overrides and every save preserves them, but no screen writes them yet.
- Room count and auto-assign from the overview rail apply to every round at once; per-round differences need the editor. Rounds already launched are skipped.
- Active scope: week 5, room tasks and the participant UI. Activities, submissions, help requests and room status are later weeks; the participant room page reserves the middle column for them.
- Seeding copies from the first round only, once, on first open of a round with no draft. Later edits to round 1 do not flow forward.
- Opening a round refetches its draft every time (clean drafts are not cached), so the editor shows a short loading state.

## Frontend notes

- Toasts: `sonner`, `<Toaster />` in `app/layout.tsx`; launch/close report through `use-live-room-controller.ts`. No rail status cards.
- `getMeetingContext()` gives `meetingTopic` via `host-gate.ts`. Workspace default title is "Sample Workflow", not the meeting topic.
- `EditableName` (ui) is the inline rename used for workspace and round titles; `BrandMark` (ui) is the "B" mark that returns to landing.
- Zoom rejects `createBreakoutRooms` while earlier rooms are open ("Can not edit the Breakout Room") and `openBreakoutRooms` right after creating them ("Breakout rooms are not ready"); `whenZoomIsReady` waits both out.
- The live view is driven by `liveState.round.roundId`, never by the editor's selection. Reopening the app while a round runs lands there.
- Round status pills were removed on purpose. Do not add them back.
- Task saves happen at the edges, not per keystroke: a field commits on blur, and both the page's navigation buttons and the panel's close flush first and refuse to leave on failure. `TaskFields` keeps no copy of the list - an earlier version did, and reverted every keystroke in an existing row.
- The live screen's rail shows the round's task, not a room list; the room cards beside it already carry that.
- The participant screen has three states: no round running, running but not placed in a room, and placed. Only the third can open the room page, and losing a placement closes it.

## Infra

ngrok -> Caddy `:8080` (`/api/*` -> Express `:4000` with `flush_interval -1` for SSE; everything else -> Next `:3000`). `ZOOM_WEBHOOK_SECRET` in `backend/.env`. Marketplace event subscription: `meeting.participant_joined`, `meeting.participant_left`, `meeting.participant_joined_breakout_room`, `meeting.participant_left_breakout_room`.
