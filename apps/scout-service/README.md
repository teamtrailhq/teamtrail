# Scout service

The backend of Teamtrail's official Slack app, Scout. Slack sends every command, click and event to one public HTTPS address, and the app's secrets can't ship in an npm package, so this small service sits between Slack and each person's Teamtrail:

```
Slack ──HTTPS (signed)──▶ Scout service ◀──WebSocket (outbound, link token)── Teamtrail on your machine
                              │                                                   │
                              └── Slack Web API (workspace bot token) ◀── allowlisted calls ──┘
```

Plan and decisions: `docs/plans/scout-slack-app.md` in teamtrail-cloud.

## What it keeps, and what it never does

- **Keeps**: per workspace, the bot token, sealed with AES-256-GCM (`SCOUT_TOKEN_KEY`, bound to the team id); per linked Teamtrail, the Slack account and a SHA-256 of its link token; for a minute or ten, hashes of OAuth states and link codes.
- **Never keeps** trail content. Questions, answers, digests and Home tabs pass through in memory. Logs carry ids, method names and timings, never message text or tokens. No cookies.
- **Routes** each Slack request to the Teamtrail that posted the message clicked on (the service stamps every post with its link in Slack's message metadata), otherwise to the most recently connected Teamtrail of the Slack account that acted. When none is connected it answers at once that Teamtrail isn't running, or how to connect; nothing is queued.
- **Calls Slack** for a linked Teamtrail only with that link's own workspace's bot token, only the methods the connector uses (`src/hub/allowedCall.ts`), and only to the link owner's own DM and Home tab. Per-link rate limits, message size caps, at most five links per Slack account and two sockets per link (`src/limits.ts`).

## Routes

| Route | Who calls it |
| --- | --- |
| `POST /slack/events`, `/slack/interactions`, `/slack/commands` | Slack. Every request must carry Slack's v0 signature for this app (five-minute window, constant-time compare). |
| `GET /install?challenge=…&return=…` | A browser, from the Lookout's Add Scout to Slack. `challenge` is the Lookout's PKCE challenge (S256); `return` must be `http://` on a loopback host with a port. |
| `GET /oauth/callback` | Slack, after the consent screen. The state is single use; the browser goes back to `return` with `#slack-link=<code>` (one minute, single use). |
| `POST /link` `{ code, verifier }` | The Lookout's server: trades the code and the PKCE verifier for a link token. Refused when the request has an `Origin` (browsers can't call it). |
| `DELETE /link` (bearer link token) | The Lookout's server, on Disconnect. |
| `GET /connect` (WebSocket) | A linked Teamtrail. Its first message is `{ "type": "hello", "token": "<link token>" }`; then `ready`, `envelope` (Slack's request, in Socket Mode's shape) and `result` from the service, `ack` and `call` from the Teamtrail. Types in `src/types.ts`. |
| `GET /health` | Railway. |

## Environment

| Variable | |
| --- | --- |
| `PUBLIC_URL` | Where Slack and browsers reach the service, e.g. `https://scout.teamtrail.app`. Must be https. |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | From the Slack app's Basic Information page. |
| `SCOUT_TOKEN_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). Seals bot tokens; losing it means every workspace installs again. |
| `DATABASE_URL` | Postgres. The schema is created on start (`src/store/schema.ts`, tables `scout_*`). |
| `TRUST_PROXY=1` | Behind Railway's proxy: rate limits use the address the proxy appended to `X-Forwarded-For`. |
| `PORT` | Set by Railway. |
| `SCOUT_MEMORY_STORE=1` | Development only: no database, everything forgotten on restart. |
| `SLACK_API_URL`, `SLACK_AUTHORIZE_URL`, `SLACK_HOOKS_ORIGIN` | Tests and development only: point Slack at a fake on this machine (https, or http on loopback). |

## Create the Slack app (once, by a maintainer)

1. At https://api.slack.com/apps choose **Create New App → From a manifest**, pick a workspace you develop in, and paste `slack-manifest.json`. If the service won't be at `scout.teamtrail.app`, replace that host in the four URLs first.
2. **Basic Information → Display Information**: upload `brand/scout-badge-1000.png` as the app icon (Slack wants 512–2000 px, square). The background colour is already `#101815`, the badge's own.
3. Copy the Client ID, Client Secret and Signing Secret into the service's variables.
4. **Manage Distribution**: activate public distribution once the service is deployed, so other workspaces can install. Listing in the Slack Marketplace is a separate review (it lifts Slack's throttling of `conversations.replies` for unlisted apps, which Save as decision uses).

## Deploy on Railway

1. New project → **Deploy from GitHub repo** → `teamtrailhq/teamtrail`, branch `main`. Add a **Postgres** database to the project.
2. Service settings:
   - **Build command**: `npm ci && npm run build -w @teamtrail/scout-service`
   - **Start command**: `npm start -w @teamtrail/scout-service`
   - **Watch paths**: `apps/scout-service/**`, `packages/connector-slack/src/api.ts`, `package-lock.json` (so Lookout changes don't redeploy it)
   - **Healthcheck path**: `/health`
3. Variables: the table above, with `DATABASE_URL` as a reference to the Postgres service's, and `TRUST_PROXY=1`.
4. Networking: generate a domain, then add the custom domain (`scout.teamtrail.app`) and its CNAME at the DNS provider.
5. One instance. A deploy closes the sockets; linked Teamtrails reconnect with backoff.

## Develop

```bash
npm test -- apps/scout-service                 # the service's tests, against a fake Slack and the memory store
SCOUT_TEST_DATABASE_URL=postgres://… npm test -- apps/scout-service/test/store.test.ts   # the Postgres store too
npm run build -w @teamtrail/scout-service && SCOUT_MEMORY_STORE=1 PUBLIC_URL=https://scout.example … npm start -w @teamtrail/scout-service
```

Tests never reach Slack or a real database: the fake Slack is in `test/fakes/`, and the Postgres contract runs only when you name a database it may fill.
