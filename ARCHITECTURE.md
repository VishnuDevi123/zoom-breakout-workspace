# Architecture

Zoom App for planning and running breakout rounds. A Next.js frontend runs inside the Zoom client and is the only thing that calls the Zoom Apps SDK. An Express backend stores the plans, records launches, receives Zoom webhooks and pushes live state to the frontend over SSE. The backend never calls Zoom.

## Boundaries

Field lists live in `backend/types/breakout.ts`.

| Domain | Source of truth | Files |
| --- | --- | --- |
| Workspace (`Workspace`, `RoundMeta`) | `backend/store/workspace.ts`, one record per meeting | `backend/routes/workspace.ts`, `frontend/lib/use-workspace.ts`, `screens/RoundsOverview.tsx` (workflow page) |
| Host navigation (landing → workflow page → round setup [Rooms \| Tasks], plus live while a round runs) | `HostView` state in `screens/HostWorkspace.tsx`; no URL routes | `LandingScreen.tsx`, `RoundsOverview.tsx`, `RoundSetup.tsx`, `LiveRound.tsx`; setup and live share `PageFrame.tsx` and `NotPlacedSheet.tsx` |
| Round plan (`RoundPlan`: rooms and who is in them) | `backend/store/round-plans.ts`, keyed `(parentUUID, roundId)` | `backend/routes/round-plans.ts`, `frontend/lib/use-room-plan.ts`, `room-plan-assignments.ts`, `room-plan-copy.ts`, `use-round-summaries.ts` |
| Round task (`RoundTasks`, `RoomTask` incl. `checklist`, plus `activities`) | `backend/store/tasks.ts`, keyed `(parentUUID, roundId)` | `backend/routes/tasks.ts`, `frontend/lib/use-round-tasks.ts` (host), `use-participant-round.ts` (participant), `TaskFields.tsx`, `ActivityList.tsx` |
| Activity responses (`RoomResponses`: answers, idea notes, checklist ticks) | `backend/store/activity_responses.ts`, keyed `(parentUUID, roundId, roomId)` | `backend/routes/activity_responses.ts` at `/api/responses`, `frontend/lib/use-room-responses.ts` (participant), `use-room-results.ts` (host) |
| Live state (`LiveState`: who is where, which round is live, room mapping, timer) | `backend/store/live.ts`, one record per meeting, fed by webhooks | `backend/routes/webhooks.ts`, `backend/routes/live.ts`, `frontend/lib/use-live-state.ts`, `LiveRound.tsx` |
| Launch / close / mid-round placement | Frontend SDK calls, then reported to the backend | `frontend/lib/launch-round.ts`, `use-live-room-controller.ts`, `execution-api.ts` |
| Participant view | `LiveState` + the round's plan + its task + the room's responses; no SDK reads | `screens/ParticipantScreen.tsx`, `ParticipantWorkspace.tsx`, `ActivityPage.tsx` |
| Host gate | `getUserContext().role` | `frontend/lib/host-gate.ts`, `ZoomClient.tsx` |
| Zoom SDK calls from| `frontend/lib/zoom-sdk.ts`, `frontend/types/zoom.d.ts` | |
| Shared contracts | `backend/types/breakout.ts` is canonical; `frontend/types/breakout.ts` is an identical copy | |

## Data flow

```
workspace         frontend -> GET/PUT /api/workspace                    title, grouping flags, auto-start, round fields
add/remove round  frontend -> POST /api/workspace/rounds, DELETE /rounds/:roundId   (+ deletes that round's plan, task, responses)
edit plan         frontend -> PUT  /api/rounds/:roundId/rooms          from round setup (debounced) or the workflow page (one call per round)
edit task         host     -> GET/PUT /api/tasks/:roundId              from round setup or, mid-round, the Edit task modal
                  backend  -> SSE  taskRevision + 1                    participants refetch; no task text on the stream
read task         participant -> GET /api/tasks/:roundId               rooms[myRoomId] ?? all, plus activities
write response    participant -> PUT/POST/DELETE /api/responses/:roundId/rooms/:roomId/...   answers, ideas, ticks
                  backend  -> SSE  roomRevisions[roomId] + 1           that room refetches; no content on the stream
read responses    participant -> GET /api/responses/:roundId/rooms/:roomId   own answers, everyone's status, notes, ticks
read results      host     -> GET /api/responses/:roundId/rooms/:roomId/all   every answer (text once submitted), notes, ticks
launch round N    frontend -> (Same groups) copy the last round's plan into round N
                  frontend -> SDK createBreakoutRooms, assign, configureBreakoutRooms, open
                  frontend -> POST /api/live/launch                      round live, timer armed, workspace status launched
+/- 1 min         frontend -> POST /api/live/extend                      new endsAt, timer re-armed
timer ends        backend  -> SSE  round.timerEnded = true              frontend closes, then launches the next if auto-start is on
place mid-round   host     -> SDK getBreakoutRoomList, assignParticipantToBreakoutRoom; PUT the running round's plan
participant moves Zoom     -> POST /api/webhooks/zoom                    participant location, room mapping learned
close round N     frontend -> SDK getBreakoutRoomList, closeBreakoutRooms when still open
                  frontend -> POST /api/live/close                       round cleared, people back to "main", status closed
skip round        frontend -> POST /api/live/skip                        status skipped <-> planned
roster on open    host     -> SDK getBreakoutRoomList / getMeetingParticipants; POST /api/live/roster   presence rebuilt
push              backend  -> SSE  /api/live/events                      every client re-renders from LiveState
```

Launch, close and skip reply with the workspace as well, because all three change its revision.

## Identity

- Meeting key: `parentUUID ?? meetingUUID` from `getMeetingUUID()`, equal to `payload.object.uuid` in webhooks. Inside a breakout room `meetingUUID` is the room, so every store uses the parent.
- Participant key: `participantUUID` (`participant_uuid` in webhooks). Never `participantId` or `user_id`; Zoom reissues those on every room hop.
- Plan rooms have app-owned ids; Zoom room ids never enter a plan. The SDK's `breakoutRoomId` and the webhook's `breakout_room_uuid` differ and cannot be mapped; `store/live.ts` learns the webhook uuid from the first planned person who enters.
- Round ids are stable (`round-N`, next = highest + 1). Display order comes from the array, never the id. A null title shows as "Round N".
- The only account-wide id is `uid` in the encrypted `getAppContext()` token, readable by the backend alone. Not used yet; kept for templates.

## Principles

- The frontend only interacts with Zoom to lauch breakout rooms, and also from three places: Launch workflow, End round / Launch next, and the live "Not yet placed" sheet.
- Webhooks are the source of live state after host joins. The SDK is read once at a time for:
  1. `getBreakoutRoomList()` when the app opens on a round the backend still calls live.
  2. `getBreakoutRoomList()` again before `closeBreakoutRooms`, to skip a close Zoom does not need.
  3. The roster read when the host opens the app: `getBreakoutRoomList()`, or `getMeetingParticipants()` when no rooms are open.
  4. `getBreakoutRoomList()` once per placement from the "Not yet placed" sheet, to learn Zoom's room ids.
- The backend records what the frontend reports and what Zoom sends; it never verifies against Zoom.
- The SSE stream carries counters (`taskRevision`, `roomRevisions`), never content; clients refetch what changed.
- Writes replace whole records under a revision check, so a stale write gets 409 instead of overwriting someone else's edit.
- A participant reads no Zoom state. Their room comes from the host's saved plan; their own webhook location only chooses which screen to show.
- Grouping is one choice stored as two workspace flags. In "Same groups" a round copies the last round that ran at launch time, so plans never go stale.
- Extend existing stores, routes and hooks before adding new ones. Mirror type changes to both `types/breakout.ts` files. After removing a path, remove its types, CSS and comments in the same change.

## Known limits

- All stores are in-memory `Map`s: a backend restart loses everything, including the round timer. Zoom never replays webhooks; the host's roster read on app open fills presence back in.
- No sign-in. The backend trusts the `participantUUID` a client sends; hiding drafts and other people's answers is a server filter, not a lock.
- Zoom cannot add, rename or delete rooms while rooms are open, and only the meeting owner can read who is in each room.
- Every capability in `ZOOM_CAPABILITIES` must stay ticked on the Marketplace API list, or `config()` fails with `reason:app_not_support`.

## Active scope
SQLite persistence, then workspace templates needs to be worked on. 

## Infra

ngrok -> Caddy `:8080` (`/api/*` -> Express `:4000` with `flush_interval -1` for SSE; everything else -> Next `:3000`). `ZOOM_WEBHOOK_SECRET` in `backend/.env`. Marketplace event subscription: `meeting.participant_joined`, `meeting.participant_left`, `meeting.participant_joined_breakout_room`, `meeting.participant_left_breakout_room`.
