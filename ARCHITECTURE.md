# Architecture

Zoom App for planning and running breakout rounds. A Next.js frontend runs inside the Zoom client and is the only thing that calls the Zoom Apps SDK. An Express backend stores the plans and live state in DynamoDB, records launches, receives Zoom webhooks and pushes live state to the frontend over SSE. The backend never calls Zoom. It calls OpenAI only to draft workflows the host asks for.

## Boundaries

Field lists live in `backend/types/breakout.ts`.

| Domain | Source of truth | Files |
| --- | --- | --- |
| Meeting storage | One DynamoDB table (`MEETINGS_TABLE`): partition key `parentUUID`, sort key `item`, one item per record, each with `revision` and `expiresAt` (TTL) | `backend/services/dynamo.ts` (`readItem`, `saveItem`, `changeItem`, `deleteItems`, `roundItem`) |
| Workspace (`Workspace`, `RoundMeta`) | `backend/store/workspace.ts`, item `workspace` | `backend/routes/workspace.ts`, `frontend/lib/use-workspace.ts`, `screens/RoundsOverview.tsx` (workflow page) |
| Host navigation (landing → workflow page → round setup [Rooms \| Tasks], plus live from the first launch until End Workflow) | `HostView` state in `screens/HostWorkspace.tsx`; no URL routes | `LandingScreen.tsx`, `RoundsOverview.tsx`, `RoundSetup.tsx`, `LiveRound.tsx`; setup and live share `PageFrame.tsx` and `NotPlacedSheet.tsx` |
| Past workflows and saved templates (`WorkflowSnapshot`, `PastWorkflow`, `SavedTemplate`) | `backend/store/templates.ts`: past workflows as item `past`; templates in their own table (`TEMPLATES_TABLE`, key `ownerUid` + `id`) via `backend/services/dynamo.ts` | `backend/routes/templates.ts`, `/api/workspace/end\|past\|replace`, `frontend/lib/use-workflow-library.ts`, `WorkflowLibrary.tsx`, `SaveTemplateModal.tsx` |
| AI workflow builder (`DraftWorkflowRequest`, `DraftWorkflowResponse`, `AiChatMessage`) | Nothing stored: the chat lives in the host's browser; the backend is stateless and calls OpenAI (`openai` SDK, Responses API, strict Zod schema) | `backend/services/ai.ts`, `backend/routes/ai.ts` at `/api/ai`, `frontend/lib/use-ai-builder.ts`, `AiPrompt.tsx` (landing prompt), `AiChatPanel.tsx` (chat + proposals) |
| Round plan (`RoundPlan`: rooms and who is in them) | `backend/store/round-plans.ts`, item `round#<roundId>#plan` | `backend/routes/round-plans.ts`, `frontend/lib/use-room-plan.ts`, `room-plan-assignments.ts`, `room-plan-copy.ts`, `use-round-summaries.ts` |
| Round task (`RoundTasks`, `RoomTask` incl. `checklist`, plus `activities`) | `backend/store/tasks.ts`, item `round#<roundId>#tasks` | `backend/routes/tasks.ts`, `frontend/lib/use-round-tasks.ts` (host), `use-participant-round.ts` (participant), `TaskFields.tsx`, `ActivityList.tsx` |
| Activity responses (`RoomResponses`: answers, idea notes, checklist ticks) | `backend/store/activity_responses.ts`, item `round#<roundId>#room#<roomId>` | `backend/routes/activity_responses.ts` at `/api/responses`, `frontend/lib/use-room-responses.ts` (participant), `use-room-results.ts` (host) |
| Polls and quizzes (`ChallengeDraft`, `ChallengeView`) | `backend/store/challenges.ts`, item `round#<roundId>#challenges` | `backend/routes/challenges.ts` at `/api/challenges`, `frontend/lib/use-challenges.ts`, `ChallengeCards.tsx` (Session page), `ChallengeEditor.tsx`, `ChallengeResultsModal.tsx` (host), `ChallengeOverlay.tsx` (participant) |
| Live state (`LiveState`: who is where, which round is live, room mapping, timer, each room's status) | `backend/store/live.ts`, item `live`, fed by webhooks; also holds `people` (Zoom `uid` to `participantUUID`s and last role change), never sent to clients | `backend/routes/webhooks.ts`, `backend/routes/live.ts`, `frontend/lib/use-live-state.ts`, `LiveRound.tsx` |
| Launch / close / mid-round placement | Frontend SDK calls, then reported to the backend | `frontend/lib/launch-round.ts`, `use-live-room-controller.ts`, `execution-api.ts` |
| Participant view (landing, room page, answer modal, board page) | `LiveState` + the round's plan + its task + the room's responses; no SDK reads | `screens/ParticipantScreen.tsx`, `ParticipantWorkspace.tsx` (room page), `AnswerModal.tsx` (individual answer), `ActivityPage.tsx` (shared board); bar `RoomBar.tsx`, people `RoomPeople.tsx`, both in `PageFrame` tone "participant" |
| Host gate and start-up | `getUserContext().role`; one `LoadingScreen` until the first page's data is in | `frontend/lib/host-gate.ts`, `ZoomClient.tsx`, `screens/LoadingScreen.tsx` |
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
launch poll/quiz  host     -> POST /api/challenges/:roundId              only while the round runs, one at a time
                  backend  -> SSE  challengeRevision + 1               everyone refetches
room answer       participant -> PUT .../picks/:q (suggestion), POST .../locks/:q (final, first lock wins)
                  backend  -> SSE  roomRevisions[roomId] + 1           that room and the host refetch
reveal            host     -> POST /api/challenges/:roundId/:id/reveal  results and answer key reach every room
launch round N    frontend -> (Same groups) copy the last round's plan into round N
                  frontend -> SDK createBreakoutRooms, assign, configureBreakoutRooms, open
                  frontend -> POST /api/live/launch                      round live, endsAt set, workspace status launched
                                                                         (a round still live from a lost close is closed)
+/- 1 min         frontend -> POST /api/live/extend                      new endsAt pushed (also the host's "Add 2 minutes" prompt)
room status       participant -> POST /api/live/room-status            round.roomStatus[roomId]; pushed with the live state
timer ends        host     -> its clock reaches endsAt                  closes, then launches the next if auto-start is on
place mid-round   host     -> SDK getBreakoutRoomList, assignParticipantToBreakoutRoom; PUT the running round's plan
move person       host     -> SDK getBreakoutRoomList, assignParticipantToBreakoutRoom (Move on the room page)
participant moves Zoom     -> POST /api/webhooks/zoom                    participant location, room mapping learned;
                                                                         a move to another planned room updates the plan
link rooms        host     -> SDK getBreakoutRoomList; POST /api/live/room-links   when someone is in a room webhooks could not name
close round N     frontend -> SDK getBreakoutRoomList, closeBreakoutRooms when still open
                  frontend -> POST /api/live/close                       round cleared, people back to "main", status closed
skip round        frontend -> POST /api/live/skip                        status skipped <-> planned
roster on open    host     -> SDK getBreakoutRoomList / getMeetingParticipants; POST /api/live/roster   presence rebuilt
push              backend  -> SSE  /api/live/events                      every client re-renders from LiveState (read with fetch + token header)
end workflow      host     -> (close the open round first) POST /api/workspace/end   snapshot without people kept as a past
                                                                         workflow; workspace and every round# item deleted
read library      host     -> GET /api/workspace/past, GET /api/templates
save template     host     -> POST /api/templates (from a past workflow) or POST /api/templates/current (workflow being built)
use template      host     -> POST /api/workspace/replace {snapshot}     samples and saved templates; refused once a round has run
delete template   host     -> DELETE /api/templates/:templateId
draft with AI     host     -> POST /api/ai/workflow {messages, draft}  -> {kind:"question"} or {kind:"workflow", workflow}
                  backend  -> OpenAI Responses API                     nothing saved; the chat is resent each turn
use AI proposal   host     -> POST /api/workspace/replace {snapshot}     same path and confirm as a template
meeting ends      Zoom     -> POST /api/webhooks/zoom meeting.ended       every item of the meeting deleted; templates stay
```

Launch, close and skip reply with the workspace as well, because all three change its revision.
Every call above except the webhook carries the caller's `X-Zoom-App-Context` token.

## Identity

- Meeting key: `parentUUID ?? meetingUUID` from `getMeetingUUID()`, equal to `payload.object.uuid` in webhooks. Inside a breakout room `meetingUUID` is the room, so every store uses the parent.
- Participant key: `participantUUID` (`participant_uuid` in webhooks). Never `participantId` or `user_id`; Zoom reissues those on every room hop.
- Plan rooms have app-owned ids; Zoom room ids never enter a plan. The SDK's `breakoutRoomId` and the webhook's `breakout_room_uuid` differ and cannot be mapped; `store/live.ts` learns the webhook uuid from the first planned person who enters, and the host's app can link a room by reading Zoom's room list.
- Round ids are stable (`round-N`, next = highest + 1). Display order comes from the array, never the id. A null title shows as "Round N".
- Caller: every request carries the encrypted `getAppContext()` token as `X-Zoom-App-Context` (`apiFetch` in `frontend/lib/execution-api.ts`). `requireCaller` in `backend/services/app-context.ts` decrypts it, checks `exp` and `aud` (the client id), requires the token's `mid` to equal the request's `parentUUID`, and the token's `attendrole` to be allowed on the route. Only `mid`, the role, `uid` and `ts` are kept, for that request.
- Who a participant is: webhooks map each `participant_user_id` (the token's `uid`) to the `participantUUID`s it joined with; a request that names a `participantUUID` must be one of the caller's, or 403. A token older than the caller's last role change (`ts` vs the webhook's `event_ts`) is 401, and the app reads a fresh one.
- AI requests are host only by the token's `attendrole`, so nobody outside a meeting, and no participant, can spend the OpenAI key. The `uid` is checked, not stored.
- Template owner: `uid` (the Zoom user id) inside the encrypted `getAppContext()` token. The host's app sends the token as `X-Zoom-App-Context`; `services/app-context.ts` decrypts it (AES-256-GCM, key = SHA-256 of `ZOOM_CLIENT_SECRET`), checks `exp` and refuses guests, who carry `iid` and no `uid`. The browser never sends a user id, and the same `uid` follows the account across meetings and devices.

## Principles

- Roles: the meeting host runs the session (plan, launch, close, skip, end). A co-host only places people mid-round, edits the running round's task and activities, adjusts its time, and launches or reveals polls and quizzes. The backend enforces this from the token's `attendrole` on every route; the frontend hides the controls by the same rule.
- The frontend runs Zoom breakout actions from four places only: Launch workflow, End round / Launch next, the live "Not yet placed" sheet, and Move on the host's room page.
- Webhooks are the source of live state after host joins. The SDK is read once at a time for:
  1. `getBreakoutRoomList()` when the app opens on a round the backend still calls live.
  2. `getBreakoutRoomList()` again before `closeBreakoutRooms`, to skip a close Zoom does not need.
  3. The roster read when the host opens the app: `getBreakoutRoomList()`, or `getMeetingParticipants()` when no rooms are open.
  4. `getBreakoutRoomList()` once per placement from the "Not yet placed" sheet or per Move, to learn Zoom's room ids.
  5. `getBreakoutRoomList()` when webhooks report someone in a room no planned room is linked to, to name that room.
- The backend records what the frontend reports and what Zoom sends; it never verifies against Zoom.
- The SSE stream carries counters (`taskRevision`, `roomRevisions`, `challengeRevision`), never content; clients refetch what changed. The one exception is `round.roomStatus`, one status word per room, which is not room content and is safe for every client to see.
- Writes replace whole records under a revision check in DynamoDB, so a stale write gets 409 instead of overwriting someone else's edit.
- Changes the server makes itself (webhooks, counters, a followed move, answers) go through `changeItem`: one change at a time per record in each process, then a revision-checked write, because a deploy briefly runs two instances.
- Meeting data lives only as long as the meeting: `meeting.ended` deletes it, and a 24 h TTL from each item's last write catches a missed webhook. Saved templates are kept until deleted.
- No timers on the server: the round and each poll end at `endsAt`; the host's app closes the round, and a poll reads as revealed once `endsAt` has passed.
- A participant reads no Zoom state. Their room comes from the host's saved plan; their own webhook location only chooses which screen to show.
- Grouping is one choice stored as two workspace flags. In "Same groups" a round copies the last round that ran at launch time, so plans never go stale.
- A workflow has three stages: building (no round run yet), ongoing (from the first launch) and ended. Once ongoing, the builder is closed: landing shows only the Ongoing Workflow card, and the live Session page is the only place to change upcoming rounds. Ending moves the workflow, without people or submissions, into Past workflows; it never reopens in the builder.
- A closed round's plan decides who may read its submissions, so nothing rewrites it: bulk room edits touch only planned and skipped rounds, and closed rounds cannot be removed. This is enforced by the frontend only.
- A template is a `WorkflowSnapshot`: rounds, times, room names, task and activities, never people. Using one replaces a workflow that has not started, with new ids and every round planned.
- The AI only proposes. It returns a question or a `WorkflowSnapshot`; nothing is saved or sent to Zoom until the host presses "Use this workflow", which goes through `/api/workspace/replace` and its validators like any template. The AI never adds Zoom capabilities.
- The model fills a schema, not the snapshot itself: no ids (the server adds them), minutes instead of seconds, and one `grouping` choice (`same | new | each`) mapped to the two workspace flags. Schema limits copy the store limits. It asks one question only when the session's purpose is unclear, picks the details itself otherwise, and leaves `autoStartNextRound` false and `resources` empty unless the host asks or gives links.
- Extend existing stores, routes and hooks before adding new ones. Mirror type changes to both `types/breakout.ts` files. After removing a path, remove its types, CSS and comments in the same change.

## Known limits

- Webhooks sent while the backend is down are lost; the host's roster read on app open fills presence back in, but a participant whose join was missed gets 403 on room writes until they rejoin.
- SSE subscribers are per instance: during a deploy's overlap a change reaches the other instance's streams only on the next change or reconnect.
- Zoom cannot add, rename or delete rooms while rooms are open, and only the meeting owner can read who is in each room.
- Every capability in `ZOOM_CAPABILITIES` must stay ticked on the Marketplace API list, or `config()` fails with `reason:app_not_support`.
- Submissions exist only until End Workflow, so a participant can review past rounds only while the workflow runs.
- An AI reply takes 4–12 s. The landing progress bar is timed, not real. Cancel only stops the browser waiting; the backend still finishes the OpenAI call.
- The AI chat lives only in the open landing page: closing the panel keeps it ("Continue your AI chat" reopens it), pressing Generate starts a new one, and leaving the landing page loses it.

## Infra

Environment variables: see `backend/.env.example`; copy it to `backend/.env`. Render takes the same keys.

Local development:
- ngrok gives the local app a public HTTPS URL, used as the Zoom app's Home URL and for webhooks.
- Caddy (`:8080`) puts both apps behind that one URL: `/api/*` goes to Express (`:4000`), everything else to frontned (`:3000`).
- DynamoDB: the same tables as production, so a local backend restart keeps meeting data.

Production:
- Render runs the Express backend.
- DynamoDB stores meeting data.
- AWS Amplify hosts the Next.js frontend.

Zoom event subscriptions: `meeting.participant_joined`, `meeting.participant_left`, `meeting.participant_joined_breakout_room`, `meeting.participant_left_breakout_room`, `meeting.participant_role_changed`, `meeting.ended`.
The AI model name is `MODEL` in `backend/services/ai.ts`.
