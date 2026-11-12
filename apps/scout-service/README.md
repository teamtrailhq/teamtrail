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
- **Routes by its own record, never by what a message claims.** Every link in a workspace shares one bot, so a Scout message proves nothing about which Teamtrail it belongs to. The service records what each link made (`src/hub/recordResult.ts`, table `scout_marks`): the messages it posted (30 days), the views it opened or published (7 days), its owner's DM channel.
  - A click on a message goes only to the link on record as its poster, while that link exists and is in the clicker's workspace (and agreeing with the `scout_link` stamp in the message's metadata, if Slack includes it). Anything else (a message made through a `response_url`, an ephemeral message, a message whose link disconnected or was replaced, a click from another workspace in a Slack Connect channel) is dropped, and the clicker is told "This Scout message is no longer connected". It never falls back to the clicker's own Teamtrail.
  - A click in a modal or the Home tab, and a modal submission, goes only to the acting user's link that opened that view.
  - Slash commands, shortcuts (Save as decision) and events go to the acting user's most recently connected link. A Save as decision lets that link read the thread for ten minutes.
  - When none is connected the service answers at once that Teamtrail isn't running, or how to connect; nothing is queued.
- **Passes a `response_url` only to the poster** of the message it came from (`src/slack/forTarget.ts`): it can replace that message, so a Save as decision on someone else's message, or on one nobody posted through the service, arrives without `response_url` and `response_urls`.
- **A link lasts across reconnects.** A Teamtrail that reconnects says hello with the same link token and gets the same link, so its earlier posts and views stay live; only a new Add Scout to Slack makes a new link (the sixth replaces the oldest, whose posts then stop answering).
- **Filters acks** before Slack sees them: a command reply is always ephemeral (`in_channel`, `replace_original` and attachments are dropped), a modal submission may only return a response action, and nothing else is passed on (`src/slack/safeAck.ts`).
- **Calls Slack** for a linked Teamtrail only with that link's own workspace's bot token and only the methods the connector uses (`src/hub/allowedCall.ts`), and only on what the link owns (`src/hub/ownsTarget.ts`): `chat.update` on its own posts, `views.update` on its own views, `conversations.replies` and `chat.getPermalink` on its own posts or a thread a Save as decision gave it, `chat.postMessage` to the owner's own DM or a channel the owner is a member of (`conversations.members`, cached two minutes), `views.publish` for the owner only, and `conversations.open` with the owner as `users` and no other argument (only a `D…` channel it returns counts as the owner's DM).
- **Limits** (`src/limits.ts`): per-link call rate; per-socket message rate after the hello (past it the socket closes `too-fast`; junk is dropped); a 4 KB hello; sockets waiting for their hello capped in all and per address; WebSocket upgrades and `/install`, `/install-slack`, `/oauth/callback`, `/link` rate limited per address (IPv6 by /64); body and message size caps; five links per Slack account and two sockets per link; a signed command or click handled once within Slack's five-minute window.
- **One instance only.** The connected sockets, the replay and retry records and the membership cache are in memory: run exactly one replica.

## Routes

| Route | Who calls it |
| --- | --- |
| `POST /slack/events`, `/slack/interactions`, `/slack/commands` | Slack. Every request must carry Slack's v0 signature for this app (five-minute window, constant-time compare). Of the events, only `app_home_opened`, `app_mention` and `message.im` written by a person are passed on (never a bot's message or a subtype such as an edit), each once by `event_id`. A mention or DM goes to the writer's own Teamtrail only, never to someone else's: an allowed teammate without a connection of their own gets "not connected" (a few times at once, then once every ten seconds per person). |
| `GET /install-slack` | A browser, from the direct install URL `https://scout.teamtrail.app/install-slack` (the site's Add to Slack button, the Slack Marketplace). A 302 to Slack's consent screen under a fresh single-use state (ten minutes, stored hashed, no PKCE). The callback installs Scout in the workspace, links nobody, and shows a page that says to connect from Teamtrail → Settings → Slack. |
| `GET /install?challenge=…&return=…` | A browser, from the Lookout's Add Scout to Slack. `challenge` is the Lookout's PKCE challenge (S256); `return` must be `http://127.0.0.1:<port>` or `http://[::1]:<port>` (never `localhost`). |
| `GET /oauth/callback` | Slack, after the consent screen. The state is single use. From `/install`, the browser goes back to `return` with `#slack-link=<code>` (three minutes, single use); from `/install-slack`, it gets the "Scout is installed" page. |
| `POST /link/preview` `{ code, verifier }` | The Lookout's server, before the exchange: who the code belongs to (`team`, `user`), so the trail lead confirms "Connect as @user in <workspace>?". Doesn't use the code up; a wrong verifier does. Refused with an `Origin`. |
| `POST /link` `{ code, verifier }` | The Lookout's server: trades the code and the PKCE verifier for a link token. Refused when the request has an `Origin` (browsers can't call it). |
| `DELETE /link` (bearer link token) | The Lookout's server, on Disconnect. |
| `GET /connect` (WebSocket) | A linked Teamtrail. Its first message is `{ "type": "hello", "token": "<link token>" }`; then `ready`, `envelope` (Slack's request, in Socket Mode's shape) and `result` from the service, `ack` and `call` from the Teamtrail. Types in `src/types.ts`. |
| `GET /health` | Railway. |
| `GET /` | A browser: a 302 to Scout's page on the site, https://teamtrail.app/slack. |

## Environment

| Variable | |
| --- | --- |
| `PUBLIC_URL` | Where Slack and browsers reach the service, e.g. `https://scout.teamtrail.app`. Must be https. |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | From the Slack app's Basic Information page. |
| `SCOUT_TOKEN_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). Seals bot tokens; losing it means every workspace installs again. |
| `DATABASE_URL` | Postgres. The schema is applied on start under an advisory lock (`src/store/schema.ts`, tables `scout_*`). Use the private-network URL Railway gives the service. |
| `TRUST_PROXY=1` | Behind Railway's proxy: rate limits use the address the proxy appended to `X-Forwarded-For`. Required in production (`NODE_ENV=production` or Railway's `RAILWAY_*` variables): the service refuses to start without it. |
| `DATABASE_SSL` | `verify`, `no-verify` or `off`. Default: `off` for a host on Railway's private network (`*.railway.internal`), `verify` for anything else. |
| `PORT` | Set by Railway. |
| `SCOUT_MEMORY_STORE=1` | Development only (refused in production): no database, everything forgotten on restart. |
| `SLACK_API_URL`, `SLACK_AUTHORIZE_URL`, `SLACK_HOOKS_ORIGIN` | Tests and development only: point Slack at a fake on this machine (https, or http on loopback). |

## Accepted limits

- Channel membership is cached for two minutes: an owner who just left a channel can still be posted to there for that long.
- Users in a Slack Connect channel from another workspace can't click Scout's messages: the click is dropped.
- Buttons in ephemeral messages and in pushed views (`views.push`, not an allowed method) are dropped.

## What the connector must do (PR 3)

- Accept a click only when the message's `scout_link` stamp is its own link id (the `ready` message's `linkId`), as a second check behind the service's routing.
- Put buttons only in messages it posts with `chat.postMessage` and in views it opens or publishes, never in ephemeral replies, `response_url` posts or pushed views: clicks on those are dropped.
- Not rely on a Save as decision's `response_url` (it arrives only when the link posted that message); reply in the modal or the owner's DM instead.
- Post to the owner's DM through the channel `conversations.open` returns, or to a channel the owner is in.

## Create the Slack app (once, by a maintainer)

1. At https://api.slack.com/apps choose **Create New App → From a manifest**, pick a workspace you develop in, and paste `slack-manifest.json`. If the service won't be at `scout.teamtrail.app`, replace that host in the four URLs first.
2. **Basic Information → Display Information**: upload `brand/scout-badge-1000.png` as the app icon (Slack wants 512–2000 px, square). The background colour is already `#16302A`, the trail green: the badge's own dark tile stands out on it.
3. Copy the Client ID, Client Secret and Signing Secret into the service's variables.
4. **Event Subscriptions** must list `app_home_opened`, `app_uninstalled`, `tokens_revoked`, `app_mention` and `message.im`, and **OAuth & Permissions** the bot scopes in `slack-manifest.json` (`app_mentions:read` since 0.29). A workspace added before a new scope keeps working and gets the scope when someone adds Scout again; its Teamtrail says so.
5. **Manage Distribution**: activate public distribution once the service is deployed, so other workspaces can install. Listing in the Slack Marketplace is a separate review (it lifts Slack's throttling of `conversations.replies` for unlisted apps, which Save as decision uses).

## Deploy on Railway

1. New project → **Deploy from GitHub repo** → `teamtrailhq/teamtrail`, branch `main`. Add a **Postgres** database to the project.
2. Service settings:
   - **Build command**: `npm ci && npm run build -w @teamtrail/scout-service`
   - **Start command**: `npm start -w @teamtrail/scout-service`
   - **Watch paths**: `apps/scout-service/**`, `packages/connector-slack/src/api.ts`, `package-lock.json` (so Lookout changes don't redeploy it)
   - **Healthcheck path**: `/health`
3. Variables: the table above, with `DATABASE_URL` as a reference to the Postgres service's, and `TRUST_PROXY=1`.
4. Networking: generate a domain, then add the custom domain (`scout.teamtrail.app`) and its CNAME at the DNS provider.
5. **Exactly one replica** (Settings → Deploy → Replicas: 1); see "One instance only" above. A deploy closes the sockets; linked Teamtrails reconnect with backoff.

## Develop

```bash
npm test -- apps/scout-service                 # the service's tests, against a fake Slack and the memory store
SCOUT_TEST_DATABASE_URL=postgres://… npm test -- apps/scout-service/test/store.test.ts   # the Postgres store too (TLS off; SCOUT_TEST_DATABASE_SSL=verify to require it)
npm run build -w @teamtrail/scout-service && SCOUT_MEMORY_STORE=1 PUBLIC_URL=https://scout.example … npm start -w @teamtrail/scout-service
```

Tests never reach Slack or a real database: the fake Slack is in `test/fakes/`, and the Postgres contract runs only when you name a database it may fill.
