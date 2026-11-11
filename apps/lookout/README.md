# Teamtrail Lookout

> You pick the destination. Your agents walk the trail.

The Lookout for planning with agents: a live map of decision tickets, HITL conversations in-window, and a step-by-step activity log. **Scout** (Trail Intelligence & Logistics Trail lead) is the platform's own voice: system and coordinator lines in the activity log and onboarding speak as Scout, while worker agents keep their own ids (`claude-07`, `claude-r1`, …). In the UI a map is called a **trail**; the core model and API still say `map`. The product name, assistant name, tagline and label prefix live in exactly one place: `packages/core/src/model/brand.ts`.

## Install and run

Requires Node 20+. One package, one command:

```bash
npm i -g teamtrail            # or, without installing: npx teamtrail
cd your-repo
teamtrail
```

`teamtrail` starts a local server (default `http://localhost:7420`, the next free port if that one is taken), opens the Lookout in your browser and keeps trails as markdown in `./.teamtrail/` in the current folder. The header shows the folder name. Agents and people can edit those files directly; changes stream into the UI.

| Flag | Default | |
| --- | --- | --- |
| `--dir <path>` | `./.teamtrail` (or `$TEAMTRAIL_DIR`) | Tracker folder |
| `--port <n>` | `7420`, falls back to the next free port | With an explicit `--port`, a busy port is an error instead |
| `--host <addr>` | `127.0.0.1` | The server can write files in the tracker folder, so bind wider only on trusted networks |
| `--no-open` | | Don't open the browser |

`teamtrail --help` and `teamtrail --version` work as usual. `teamtrail` is published on npm; to try an unreleased build, `npm run pack` from the repo root and `npm i -g ./teamtrail-<version>.tgz`.

- On first run, onboarding asks for a tracker (local markdown is the default) and whether to post **full HITL transcripts** or a **summary** to tickets. Both choices can be changed later in Settings.
- An empty tracker explains that trails start in the agent's chat and offers `/scout new "your idea"` to copy. The trail switcher (top left) lists every trail with progress and waiting count, and holds **New trail**, which drafts that command. Teamtrail never runs an agent itself.

## Develop

From the repo root:

```bash
npm install
npm run dev                 # resets the dev project (npm run seed), then Vite with hot reload, http://localhost:7477
npm run dev:keep            # the same server without reseeding, keeping what you changed
npm run dev:agent           # real MCP agents working the dev project (after npm run build -w teamtrail)
npm run build               # every workspace; the lookout bundle + CLI land in packages/cli/dist
npm start                   # run the built CLI from the repo (same as `teamtrail`)
npm run pack                # → ./teamtrail-<version>.tgz, installable with `npm i -g ./teamtrail-<version>.tgz`
```

- Local development works on real data only, never a demo. `npm run seed` (run by `npm run dev`) resets `.teamtrail/` at the repo root to a fixed project: a trail mid-flight (decisions made and superseded, done, blocked and ruled-out work) and a plan-only trail, written as plain files through the same adapters a user's install uses. It only wipes a folder it created (marked `.dev-seed`).
- `npm run dev:agent [agents=2] [trail=#1]` connects real agents over MCP (`teamtrail mcp`, as Claude Code does). They claim ready tickets, report progress and usage, close agent-only work, and ask you on tickets that need a human, waiting for your answer in the Lookout.
- Use `TEAMTRAIL_DIR=/abs/path/.teamtrail npm run dev:keep` to open another folder without reseeding. Env var names come from `brand.ts`.
- `npm run typecheck` typechecks every workspace. `node scripts/verify-cli.mjs <url> <trackerDir>` smoke-tests a running `teamtrail`. The landing screenshots and video ([teamtrail-landing](https://github.com/teamtrailhq/teamtrail-landing): `npm run media`, `npm run journey`) run on the same seed with real agents.

### How the package is built

`packages/cli` is the publishable `teamtrail` package. `npm run build` builds the Lookout with Vite, then `packages/cli/build.mjs` bundles `src/cli.ts` with esbuild into a single `dist/cli.js` (no runtime dependencies) and copies the static bundle into `dist/app`. At runtime one Node process serves `dist/app` and the tracker API (`/__teamtrail/list`, `/file`, `/events`, `/decisions`). There's no Vite at runtime. The API handler lives in `packages/core/src/server/` (entry `packages/core/src/bridge.ts`) and is shared with the Vite dev plugin, so dev and the CLI serve the same contract.

## Screen layers (progressive disclosure)

Layers by priority. Smaller screens show fewer layers by default; larger screens add zones around the existing ones and never move them.

| # | Layer | Phone (<1024px) | Laptop (1024–1439px) | Wide (≥1440px) |
| --- | --- | --- |
| 1 | Waiting on you inbox + answer (all trails) | Home view (default) | Left column | Left column |
| 2 | Repo / trail title + destination | Header | Header | Header (+ elapsed, progress, tracker pulse) |
| 3 | Up next: frontier + claimed tickets | Home view, under the inbox | Left column, under the inbox | Left column, under the inbox |
| 4 | Map graph (drag / pinch / wheel to pan and zoom) + status panel | Map tab (legend, no panel) | Center, panel on the left edge | Center, panel on the left edge |
| 5 | Selected ticket | Ticket tab | Right zone, default tab | Right zone, top |
| 6 | Current step, sessions/claims (live timers, usage), activity log | Activity tab (stacked) | Right zone, Activity tab (stacked) | Under the map: step + sessions, then log |
| 7 | Not yet specified, decisions, out of scope, notes | Plan tab | Right zone, tab | Right zone, bottom |
| 8 | Changelog / about | Settings → Changelog | Settings → Changelog | Settings → Changelog |
| — | While you were away | Dialog: Scout line, Done / Blocked / Waiting / Spend tiles, Done, Blocked, Waiting lists | Dialog: adds Ruled out, Agent decisions and Active sessions lists | Same, with an Agent decisions tile |
| — | Decisions audit | Header → Decisions: list, tap for detail; filters behind a toggle | Covers the zones under the header: list + detail, filters as a row | Same, with a filter rail on the left and a trail column |

The phone tab bar is fixed at the bottom. Breakpoints live in `useBreakpoint()` (`src/hooks/useBreakpoint.ts`); the grids are the `.bp-*` rules in `src/styles/layout.css`. Motion is limited to state changes (a new inbox item, a node changing state) and respects `prefers-reduced-motion`.

The Changelog tab reads `apps/lookout/src/features/settings/releases.ts` (`RELEASES` for what shipped, `NEXT` for what's coming).

## Type, colour and the Scout mark

One typeface family, defined as CSS variables at the top of `src/styles/base.css` and loaded in `src/fonts.ts` (all SIL OFL 1.1 via Fontsource):

| Variable | Face | Used for |
| --- | --- | --- |
| `--display` | Chakra Petch | headings, agent and Scout voice |
| `--mono` | Share Tech Mono | caps labels, readouts, tracker lines |
| `--sans` | Barlow | body; trail lead (human) voice in italic |
| `--dot` | Doto | signal moments only: a new decision request, a trail launch |

Voices: `--voice-human`, `--voice-agent` and `--voice-data` keep operators, agents and tracker/system data visually distinct in the inbox, comms and activity log. Feed entries with `signal: true` render in the dot-matrix face.

Colour: the base palette is a desaturated blue / orange set (`--accent-rgb`, `--claimed-rgb`, `--amber-rgb`, `--decided-rgb`, `--line-rgb`). Saturated colour (`--urgent`) is reserved for warnings, waiting on you and danger.

The Scout mark (`src/components/ui/ScoutMark.tsx`) is an open ring with an arrow tip. Its variants double as glyphs: `status` (tracker chip), `action` (primary buttons), `voice` (Scout log lines and chips) and `alert` (waiting on you). `npm run dev`, then open `/?mark-sheet` for the sheet of variants.

## Widgets → metrics

Rule: every number on screen is either a raw field of the tracker / activity stream or a named metric in `packages/core/src/planning/metrics.ts`. Nothing is simulated: in development the same inputs come from the seeded project and `npm run dev:agent`.

| Widget (zone) | Metric (`@teamtrail/core`) | Source |
| --- | --- | --- |
| Header: Trail T+ | raw `map.createdAt` | tracker |
| Header: Decided x/y; switcher progress | `trailProgress` | tracker |
| Header: tracker chip (sync dot, last-write latency) | `monitorTracker` → `TrackerHealth` | every adapter write, timed by the monitor proxy |
| Header / inbox: waiting count | raw `activity.pending` | HITL `ask()` |
| Inbox: Oldest, Avg wait | `hitlStats` | `activity.pending`, `activity.answered` (ask/answer times) |
| Status panel: decided … ruled out, resolution % | `stateCounts` | tracker |
| Status panel: Critical path | `criticalPath` (longest open blocking chain) | tracker blocking edges |
| Status panel: Decided / h + burndown sparkline | `throughput` (rolling hour; decided per bucket; open tickets per bucket) | ticket `createdAt` / `closedAt` |
| Status panel: Type mix bars | `typeMix` | tracker |
| Briefing: done, ruled out, blocked, waiting, agent decisions, active, Scout line | `buildBriefing`, `briefingLine` (`briefing.ts`) | tracker tickets (`closedAt`, `createdAt`), decision records, `activity.pending/sessions`, each since `Presence.lastSeen(trail)` |
| Briefing: spend · tokens · sessions since | `UsageLedger.since` (`activity/usageLedger.ts`) | agent usage reports via `ActivityStream`, 5-minute buckets kept 14 days |
| Decisions: Active, Superseded, Last 24h, Human %, per-source counts | `decisionStats` | decision records + derived tracker entries |
| Current step: `WORK 3/5 : RESOLVE #7` + pipeline | raw `SessionInfo.step/total/stepLabel` | session step events |
| Sessions: live timer | raw `SessionInfo.startedAt` | session start |
| Sessions: tokens · cost per session; Trail total | raw `SessionInfo.usage`; `trailUsage` | agent usage reports via `SessionHandle.usage()` |
| Sessions: claims per agent | `claimsByAgent` | tracker assignees |
| Activity log: time / source / message | raw `FeedEntry` (system lines attributed to Scout) | activity stream + tracker events |

`activity.answered` and per-trail usage live in the in-memory activity stream, so they reset on reload until the CLI or an MCP server persists session reports.

## Code layout

```
packages/core            UI-free engine (@teamtrail/core). No React, no DOM.
  src/model/             brand (the only place the product name appears), types (map / ticket / session / feed; MapMode), steps, frontmatter, integrations
  src/planning/          derive (node state, frontier, HITL/AFK, layout), metrics (named HUD metrics + tracker monitor), briefing,
                         operations/ (chartMap, chooseNext, claim, resolve, promoteToTicket, ruleOutOfScope, setMapMode),
                         decisions/ (record file format, source registry, audit merge, filters, chain, export, stats)
  src/adapters/          adapter.ts (TrackerAdapter: tracker = source of truth; only primitives), markdown/ (real, plus node:fs MarkdownFs),
                         memoryAdapter (tests), seed/ (dev seed), remote/ (sync engine, github, linear, bridge client)
  src/activity/          ActivityStream (sessions, step events, usage, HITL ask/answer, feed), Presence and UsageLedger on a KeyValueStore
  src/server/            HTTP tracker API (tracker routes, decisions, agents, SSE), used by the CLI and the dev server
  src/agents/            agent link: session docs + answers shared between MCP agent processes and the Lookout; doc writer, server lock
  src/lib/               small shared helpers (emitter, keyed lock, JSON files)
  src/index.ts, node.ts, bridge.ts, agentHost.ts   entry points: @teamtrail/core, /node, /bridge, /agents
apps/lookout      Vite + React front end; plugins/trackerFs.ts mounts the tracker API on the dev server
  src/App.tsx            layout shell per breakpoint; its private parts (header, briefing, settings wiring, phone views, navigation) are in src/app/
  src/components/ui/     design-system primitives, one per file (Button, Panel, Card, Tabs, Zone, ScoutMark, …)
  src/features/<name>/   one folder per zone or dialog: inbox, map, inspector, activity, status, up-next, plan, decisions, briefing, header, trail, settings, trackers, slack
  src/hooks/             useLookout (state + actions), useBriefing, useBreakpoint, useNow, usePrefs
  src/lib/               React-free helpers: runtime, prefs, format, labels, sessions, trail lead actions
  src/styles/            index.css imports the design system then one stylesheet per zone, in cascade order
packages/cli             the `teamtrail` npm package: src/cli.ts (subcommand dispatch), build.mjs (bundle + copy app)
  src/args/              flags and help text
  src/serve/             the default command: static server for the bundle + tracker API, port retry, browser open
  src/mcp/               `teamtrail mcp`: MCP server (server.ts, tools/ by area) over the agent controller (agent.ts, trail/)
  src/usage/             real token and cost usage read from Claude Code and Codex logs
  src/connect.ts         `teamtrail connect claude|codex`; commands/scout.md is the /scout command
scripts/                 seed-dev.ts (dev seed), dev-agent.mjs (real MCP agents for dev), verify-cli.mjs (CLI smoke test), verify-mcp.mjs (MCP end-to-end), check-markdown.mjs
THIRD_PARTY_NOTICES.md   credit and MIT licence for the reused skill concepts
```

Every UI write goes through `planning/operations/`, then through the monitored adapter. The UI re-reads from the tracker on every tracker event. External edits to the markdown files (for example by another agent) stream in over SSE.

## While you were away

`Presence` (`packages/core/src/activity/presence.ts`) stores when the trail lead was last present, per trail, in a `KeyValueStore` (localStorage scoped by tracker root). `apps/lookout/src/hooks/useBriefing.ts` decides presence: while the tab is visible, the trail lead was present at their last input; hiding the tab while active counts as present until then. The briefing opens when the app loads, the tab becomes visible, or input arrives after an idle stretch, if the trail lead was away at least the threshold (Settings → Briefing, default 15 min, or Off) and `buildBriefing(...).changed`. A first run, with no presence yet, shows none. Header → Briefing reopens the last one.

## Decision records

Every resolve, ticket rule-out and supersede writes a `DecisionRecord` (`packages/core/src/model/types.ts`) through `recordDecision` / `supersedeDecision` in `planning/operations/`. Local markdown keeps each one at `.teamtrail/<trail>/decisions/D-<n>.md` (frontmatter plus Question, Decision, Summary, Alternatives, Rationale, Transcript sections). The record keeps the full HITL transcript even when only a summary is posted to the ticket. Decided tickets without a record (closed by hand in the tracker) appear as derived `tracker` entries built from their resolution comment.

`source.kind` is one of `lookout | agent | slack | tracker`. To add a source, extend `DecisionSourceKind` and `DECISION_SOURCES`. Put source-specific ids in `source.meta` and the permalink in `source.url`. `source.ref` dedupes re-imports. Actor ids are namespaced strings (`trail lead`, `claude-07`, `slack:U123`).

| Route (under `/__teamtrail`) | |
| --- | --- |
| `GET /decisions[?trail=<id>]` | `{ decisions: DecisionRecord[] }`, newest first |
| `POST /decisions` | body `{ trail, appendToTrail?, ...DecisionInput }` → `201` record; same `source.kind` + `source.ref` returns the existing record |
| `POST /decisions/<id>/supersede` | body `{ trail, ...DecisionInput }` → `201` new record; `409` if already superseded |
| `GET /events` | SSE: unnamed `{ path }` per changed file, plus named `decision` events `{ kind: decision.recorded \| decision.superseded \| decision.updated, mapId, decision }` and named `agent` events (`AgentSessionDoc`) |
| `GET /agents` | `{ sessions: AgentSessionDoc[] }`: running agent sessions and those of the last 24 h |
| `POST /agents/answer` | body `{ sessionId, questionId, text, author? }` → `201`; `409` if the question is not open |

## Agents over MCP

`teamtrail mcp` (`packages/cli/src/mcp/`) is the MCP server a coding agent starts over stdio. Each agent process runs its own `ActivityStream` and writes one doc per session to `.teamtrail/.agents/sessions/<id>.json` (`AgentDocWriter`, `agents/agentDocWriter.ts`). The bridge streams those docs as `agent` events; in local-markdown mode `runtime.ts` mirrors them with `ActivityStream.syncRemote`, so remote sessions, their questions, chat and usage use the same inbox, sessions and map UI as everything else. An answer in the inbox goes to `POST /agents/answer`, which writes `.teamtrail/.agents/answers/<session>/<question>.json`; the agent process picks it up and its `ask_human` call returns. Docs are polled by mtime as well as watched, and a session whose process is gone shows as disconnected. While `teamtrail` serves, `.teamtrail/.agents/server.json` tells agents the lookout URL.

## Model notes

- Ticket types: research, prototype, junction, task, and **execute** (carrying out decided work). Junction and prototype are always HITL. Research is always AFK. Task and execute are AFK unless labelled `teamtrail:hitl`.
- Labels: `teamtrail:map` on the trail issue, `teamtrail:<type>` on tickets, `teamtrail:plan-only` for plan-only trails.
- Trail mode: new trails default to **plan + execute**. **Plan-only** disables new execute tickets and parks existing ones. Switch it per trail with the header chip or in Settings.
- HITL: a session calls `ask()` and blocks until the trail lead answers in the inbox conversation. The inbox collects questions from every trail, tagged with the trail name. The ticket shows red "waiting on you" meanwhile. On resolve it posts the resolution, plus the transcript in full mode, then closes the ticket (recording `closedAt`), writes a decision record and appends to Decisions so far.

## Real only

Everything the Lookout shows comes from a real tracker (local markdown, GitHub Issues, Linear) and real agents over MCP. There is no demo tracker and no simulated agent; work starts and moves in the agent's chat (`/scout new`, `/scout resume`). For development, `npm run seed` and `npm run dev:agent` provide the data and the agents.

## Renaming

1. Edit `packages/core/src/model/brand.ts`. That changes the display name, assistant, tagline, label prefix, data dir, API route and env var.
2. Change the npm scope `@teamtrail/*` and the published package name `teamtrail` (`packages/cli/package.json`, its `bin`, and the root scripts), if desired.
3. Existing trackers then need their labels migrating (for example `teamtrail:map` to `<new>:map`).
