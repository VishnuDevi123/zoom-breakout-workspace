# Architecture

## Core boundaries

| Domain | Source of truth | Main files |
| --- | --- | --- |
| Round draft | Backend round-plan store, keyed by `(parentUUID, roundId)` | `backend/store/round-plans.ts`, `backend/routes/round-plans.ts`, `frontend/lib/use-room-plan.ts` |
| Live Zoom state | Latest observed room snapshot | `backend/store/snapshots.ts`, `frontend/lib/use-room-snapshot.ts`, `frontend/lib/normalize-rooms.ts` |
| Participant placement | Saved draft participant UUIDs and stay-in-main intent | `frontend/lib/room-plan-assignments.ts`, `frontend/app/components/Rooms.tsx` |
| Zoom SDK access | Shared SDK bootstrap and typed capabilities | `frontend/lib/zoom-sdk.ts`, `frontend/types/zoom.d.ts` |
| Host authorization | SDK role gate | `frontend/lib/host-gate.ts`, `frontend/app/components/ZoomClient.tsx` |
| Shared contracts | Mirrored frontend/backend types | `frontend/types/breakout.ts`, `backend/types/breakout.ts` |

## Rules

- Draft edits never mutate Zoom. Only explicit execution actions may do that.
- Draft and live snapshot state remain separate; names never establish identity.
- Use app room IDs for drafts, Zoom room IDs for live observations, and participant UUIDs for placement.
- Extend existing domain modules before creating new state, routes, hooks, or helpers.
- Mirror contract changes across frontend and backend.
- Before implementation, search existing exports and call sites. Afterward, remove obsolete paths and update slice status.

## Delivery sequence

Current implementation scope lives in `week3-verticle-slices/`. Read `week3_status.md`, then the active slice and `design_reference.md` before changing behavior.
