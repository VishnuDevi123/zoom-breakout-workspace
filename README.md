# Breakout Workspace

A Zoom App for planning and running breakout rooms. The host plans rounds (or has AI draft them), gives every room a task, checklist and activities, launches the rounds from inside the meeting, and sees what each room produced. Participants get their room's task and activities in the app panel.

This is a prototype. Try it without Zoom in the interactive demo on the project website (`/demo`).

## What's in this repo

| Folder        | What it is                                                                                                                                      | Runs on            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `frontend/` | The Zoom App itself (Next.js). Runs inside the Zoom client and is the only part that calls the Zoom Apps SDK.                                   | `localhost:3000` |
| `backend/`  | Express API: stores workflows, plans and tasks, receives Zoom webhooks, pushes live state to the app over SSE, calls OpenAI for the AI builder. | `localhost:4000` |
| `website/`  | The project website and the interactive demo (static Next.js). Needs no backend.                                                                | `localhost:3100` |

`ARCHITECTURE.md` explains how the pieces fit together.

## Requirements

- Node.js 20 or newer (developed on 24) and npm
- A Zoom account that can create apps on the [Zoom App Marketplace](https://marketplace.zoom.us/)
- [ngrok](https://ngrok.com/) (or another HTTPS tunnel) and [Caddy](https://caddyserver.com/), because Zoom only loads apps over HTTPS
- For saved templates: an AWS account with a DynamoDB table
- For the AI builder: an OpenAI API key

## 1. Install

```bash
git clone https://github.com/VishnuDevi123/zoom-breakout-workspace.git
cd zoom-breakout-workspace
(cd backend && npm install)
(cd frontend && npm install)
(cd website && npm install)   # only if you want the website
```

## 2. Configure the backend

Copy the example file and fill it in:

```bash
cp backend/.env.example backend/.env
```

The backend reads these values:

| Variable                                                         | Needed for                                           | Where to get it                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                                         | Always                                               | `4000` (Caddy forwards `/api/*` there)                                                                                        |
| `ZOOM_CLIENT_SECRET`                                           | Reading the Zoom app context (templates, AI builder) | Marketplace app,**App Credentials**                                                                                         |
| `ZOOM_WEBHOOK_SECRET`                                          | Verifying Zoom webhooks (who is in which room)       | Marketplace app,**Features → Event Subscriptions → Secret Token**                                                         |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Saved templates                                      | An IAM user allowed`PutItem`, `Query` and `DeleteItem` on the table below. A local AWS CLI login works instead of the keys. |
| `TEMPLATES_TABLE`                                              | Saved templates                                      | Name of a DynamoDB table with partition key`ownerUid` (string) and sort key `id` (string), on-demand capacity                 |
| `OPENAI_API_KEY`                                               | AI workflow builder                              | [OpenAI API keys](https://platform.openai.com/api-keys)                                                                            |

Never commit `backend/.env`.

Everything except saved templates is kept in memory, so restarting the backend clears the meeting's workflow, plans, tasks and answers.

## 3. Run it locally

You need four terminals:

```bash
# 1. Backend
cd backend && npm run dev

# 2. Zoom App
cd frontend && npm run dev

# 3. Caddy: one HTTPS-ready origin on :8080 (/api to the backend, the rest to the app)
caddy run --config Caddyfile

# 4. Tunnel: gives Zoom a public HTTPS address for :8080
ngrok http 8080
```

Copy the `https://….ngrok-free.app` (or `.dev`) address that ngrok prints. You need it in the next step.

`frontend/next.config.ts` lists the tunnel domain in `allowedDevOrigins`. Replace it with your own ngrok domain, or Next.js will block the app's dev requests.

## 4. Create the Zoom app

On the [Zoom App Marketplace](https://marketplace.zoom.us/), create a **General App** (user-managed), then:

1. **Basic information:** set the OAuth redirect URL to `https://<your-ngrok-domain>/auth/callback`.
2. **Features → Surface:** add the **Zoom App** surface for meetings, set the **Home URL** to `https://<your-ngrok-domain>/`, and add your ngrok domain to the **domain allow list**.
3. **Features → Zoom App SDK:** tick every API the app uses, or `config()` fails with `reason:app_not_support`:
   `getMeetingUUID`, `getUserContext`, `getMeetingContext`, `onMyUserContextChange`, `configureBreakoutRooms`, `createBreakoutRooms`, `assignParticipantToBreakoutRoom`, `openBreakoutRooms`, `closeBreakoutRooms`, `getBreakoutRoomList`, `getMeetingParticipants`, `getAppContext`.
4. **Features → Event Subscriptions:** set the endpoint to `https://<your-ngrok-domain>/api/webhooks/zoom` and subscribe to:
   `meeting.participant_joined`, `meeting.participant_left`, `meeting.participant_joined_breakout_room`, `meeting.participant_left_breakout_room`.
   Zoom validates the endpoint when you save, so the backend, Caddy and ngrok must be running.
5. Copy the **Client Secret** and the **Secret Token** into `backend/.env`, then restart the backend.
6. **Local test:** add the app to your account, start a Zoom meeting, and open it from **Apps** in the meeting toolbar.

The free ngrok plan gives you a new address each time you restart it. When that happens, update the Home URL, redirect URL, allow list and webhook endpoint in the Marketplace.

## 5. Using the app

- **Host or co-host:** plan rounds on the workflow page (or describe the session and let the AI draft it), set rooms and tasks, then **Launch workflow**. The live page shows each room's progress and results.
- **Participants:** open the app from **Apps**. It shows your room's task, checklist and activities once you are in your breakout room.
- Breakout rooms must be enabled for the Zoom account, and only the meeting host or a co-host can launch rounds.

## Checks

```bash
(cd backend && npx tsc --noEmit)
(cd frontend && npx tsc --noEmit && npx eslint lib app --quiet && npm test)
(cd website && npx tsc --noEmit && npx eslint . --quiet)
```

## Known limits

- In-memory storage: a backend restart loses live sessions (saved templates survive in DynamoDB).
- The backend runs as a single instance (live updates use server-sent events).
- Participants are identified by the `participantUUID` the app sends; there is no separate sign-in.
- Zoom cannot rename, add or remove rooms while rooms are open, and only the meeting owner can read who is in each room.
