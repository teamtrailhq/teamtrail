# AGENTS.md

How to change Teamtrail safely. For coding agents (Codex reads this file; Claude Code reads it through `CLAUDE.md`) and for people. Read it before you start. Code standards live in `CONTRIBUTING.md`; this file links to them rather than repeating them.

**Keep this current.** A PR that changes the architecture, a data location or one of the recipes below updates this file in the same PR. `packages/core/test/agents-md.test.ts` fails if a path written here doesn't exist.

## What Teamtrail is

Teamtrail is a local trail map for big work done by AI coding agents. A human describes a trail. Agents chart it as a map of decision tickets (`research`, `prototype`, `junction`, `task`, `execute`, plus `review`) with blocking edges, claim tickets over MCP, ask the human questions, and record decisions with evidence. The human steers in the Lookout, a web app served by the `teamtrail` CLI on their machine. Scout is the voice of Teamtrail wherever the human meets it, in the coding agent, the Lookout, Slack, the site and the docs: briefings, framing questions and system lines.

## Product rules

Every change follows these. If a task seems to need breaking one, stop and ask.

- **Agent-agnostic.** Everything goes through MCP tools. Nothing may depend on one model or vendor, and Teamtrail never calls a model itself. Agents write briefs, knowledge and criteria; Teamtrail gives them structure and enforces gates in code.
- **Local-first.** State is plain files in the repo's `.teamtrail/` folder, or in the user's GitHub or Linear tracker. The local product never needs a Teamtrail server. The paid hosted mode is optional, and nothing local may depend on it.
- **Deterministic core.** Lifecycle, state, gates, ranking and selection are code, not prompts. The same inputs always give the same result, and every automated choice carries a human-readable reason.
- **Evidence over claims, and human leverage.** Teamtrail never answers a question or approves anything on the human's behalf. Agents may decide low-risk matters themselves when allowed, and must record those decisions where the human can review them.
- **Not an executor (locally).** The local product doesn't start, schedule or run agents. It may prepare workspaces (git worktrees) for agents that ask.
- **Not a feed of agent activity.** If a feature only makes the activity feed prettier, it doesn't belong here.

## Architecture map

npm workspaces monorepo. Node 20+, TypeScript, ESM.

| Path | What it is |
| --- | --- |
| `packages/core` | The engine, UI-free: the trail model, tracker adapters, planning and lifecycle, verification, evidence, agent coordination and the HTTP bridge. Zero runtime dependencies. Entry points in `packages/core/package.json` `exports`: `.` (`src/index.ts`), `./node`, `./bridge`, `./agents`. |
| `packages/cli` | The `teamtrail` command, published as `teamtrail` (bin `teamtrail`). It serves the Lookout and the bridge (`src/serve/`), runs the MCP server (`src/mcp/`), connects agents (`src/connect.ts`), manages the projects registry (`src/projects.ts`), greets people in the terminal (`src/greeting.ts`) and meters usage (`src/usage/`). Built into one bundle by `packages/cli/build.mjs`. |
| `apps/lookout` | The React + Vite web UI, bundled into the CLI. |
| `packages/connector-slack` | The optional Slack connector: questions, approvals and briefings in Slack. |
| `packages/scout-avatar` | The Teamtrail logo (`src/logo/`) and Scout's badge (`src/scout/badgeArt.ts`): a React component and a framework-free renderer (`mountScout`). |
| `scripts` | Dev tooling: the seed (`scripts/seed-dev.ts`, with M4's policy, assumptions and proposals in `scripts/seedSupervision.ts` M3's worktree setting and overlapping claims in `scripts/seedParallel.ts`, model matching and two agents on different models in `scripts/seedModels.ts`, a finished trail for Trail stats in `scripts/seedHistory.ts`, and a second project in a dev-only registry in `scripts/seedProjects.ts`), scripted MCP dev agents (`scripts/dev-agent.mjs`), the end-to-end check (`scripts/verify-mcp.mjs`, M4 steps in `scripts/verifySupervision.mjs`, M3 steps on a scratch git repo in `scripts/verifyParallel.mjs`, model-aware claiming in `scripts/verifyModels.mjs`, M5's two repos in All projects in `scripts/verifyProjects.mjs`) and the local npm registry (`scripts/registry-local.mjs`). |
| `.github/workflows` | CI (`ci.yml`, runs `npm run check`) and the manual Release workflow (`release.yml`). |

The landing site lives in its own repo, `teamtrailhq/teamtrail-landing`.

### Tracker data (`.teamtrail/` in the user's repo)

- `<trail>/map.md`: trail frontmatter plus the map body (Destination, Notes, Assumptions, Decisions so far, Not yet specified, Out of scope). Assumptions are `S-<n>` lines with their status (holding, challenged, invalidated, confirmed), linked tickets and challenge in an HTML comment marker (`packages/core/src/model/assumptionLine.ts`); accepting a brief adds its assumptions. The format is shared by every adapter (`packages/core/src/model/mapBody.ts`). The frontmatter also holds the trail's verification level and model matching (`model-matching: on`, `model-tiers: [research=fast, …]`; `packages/core/src/adapters/markdown/modelMatchingFront.ts`); GitHub and Linear keep both in the trail issue's meta marker.
- `<trail>/tickets/<n>.md`: ticket frontmatter, body and comments. `<trail>/decisions/<D-n>.md`: decision records.
- `verification.json`: the checks agents' completions run. Committed.
- `briefs/<mapId>.md`: the trail's discovery brief and its status. A trail with a brief requires discovery: implementation tickets can't be claimed until the trail lead accepts it. Committed.
- `criteria/<mapId>.md`: acceptance criteria per ticket (`AC-<n>`, kind, optional knowledge source) and the trail lead's confirmation. Required for implementation tickets on trails with a brief; each needs evidence when the work is completed. Committed.
- `knowledge/K-<n>.md`: project and product knowledge entries (suggested, confirmed, assumption, outdated). Committed, so teammates share it.
- `policy.json`: the risk policy, what always needs the human: a level (low, medium, high) per category and path rules (`packages/core/src/policy/`). Agents can't record high-risk decisions themselves. Optional (defaults apply); committed.
- `models.json`: the project's extra models for model matching, model id or glob to tier (`fast`, `balanced`, `strongest`), read before the built-in families (`packages/core/src/model/modelTier.ts`). Optional; committed.
- `workspaces.json`: whether each claimed ticket gets its own git worktree and branch (`teamtrail/<trail>/<n>`, in `<repo parent>/<repo>.teamtrail/<trail>-<n>`). Off when missing; committed. Teamtrail prepares worktrees only: it never merges, pushes or deletes them.
- `attention.json`: the team's attention policy (kind weights, the interrupt threshold, the digest cadence). Optional; committed. Each person's focus hours and notification channel live in `attention.json` in their user config dir, never in the repo.
- `.attention/state.json`: snoozes and dismissals of attention items. Local only, git-ignored.
- `.events/<mapId>.jsonl`: the append-only lifecycle journal (`packages/core/src/history/journalFile.ts`): transitions and reroute steps. Local only, git-ignored.
- `.agents/workspaces/<map>--<ticket>.json` and `.agents/integration.json`: the worktree prepared for each claim (checks and git evidence for that ticket run in it), and the latest check of active claim branches that changed the same files. The files an agent said it would change (`touches`) live on its lease. Local only.
- `.reroutes/<mapId>/R-<n>.json`: reroute proposals (typed changes, status, what was applied). A pending one freezes the tickets it touches; only the trail lead approves or rejects. Local only, git-ignored.
- `.evidence/`: verification attempts, check output and git evidence per ticket.
- `.agents/`: cross-process coordination between MCP processes and the Lookout, including sessions, answers, leases, trail names and the server lock.

### Projects registry (the user config dir, never a repo)

- `<config dir>/projects.json` (`$TEAMTRAIL_CONFIG_DIR`, else XDG, else `~/.config/teamtrail`): the repos one Lookout supervises, each with a short id hashed from its tracker folder's real path (`packages/core/src/projects/`, types in `packages/core/src/model/project.ts`). `teamtrail projects add|list|remove` edits it; `teamtrail mcp` and `connect` add their repo on start unless `--no-register`, `$TEAMTRAIL_NO_REGISTER` or the registry's `autoRegister: false`. Nothing new is written inside a repo; a project another live `teamtrail` serves (its `.agents/server.json`) is only read here.

GitHub Issues and Linear store the map and tickets in the tracker instead (`packages/core/src/adapters/remote/`), with the same body format. The local folders above are still used for the journal, evidence and agents.

### Core modules (`packages/core/src`)

- `model/`: types (`types.ts`: `MapDoc`, `Ticket`, `TicketType`), lifecycle phases and journal entries (`lifecycle.ts`), frontmatter and map body formats, the product name and slug (`brand.ts`).
- `adapters/`: the `TrackerAdapter` interface (`adapter.ts`), the markdown adapter (`markdown/`), GitHub and Linear (`remote/`), and an in-memory adapter for tests.
- `planning/`: graph derivation (`derive.ts`), charting and other operations (`operations/`), lifecycle transitions (`lifecycle/`), decisions (`decisions/`), metrics, delivery across trails (`performance.ts`, `performanceRecommendations.ts`) and the away briefing (`briefing.ts`).
- `verification/` and `evidence/`: checks, review, approvals, outcomes, git evidence and PR/CI sync.
- `agents/`: leases, trail names, agent docs and returning stalled claims to the queue.
- `discovery/`: the discovery brief model, file format, gate (`claimableTypes`, `gateReason`) and store.
- `criteria/`: acceptance criteria, matching them to completion evidence (`checkCriteria`), and the store.
- `knowledge/`: knowledge entries, file format, search, per-ticket selection (`selectKnowledge`), staleness from file hashes, and the store.
- `policy/`: the risk policy: defaults, file parser, store, `riskLevelFor` (the level of a call from its category and paths), `policyViolations` and `decisionsByRisk`.
- `workspaces/`: safe parallel work: the setting and its parser, `prepareWorktree`, touch-set overlaps (`globsOverlap`, `touchOverlaps`), the integration check (`scanIntegrations`, `findIntegrations`) and the trail lead's integration ticket (`addIntegrationTicket`).
- `planning/assumptions/` and `planning/reroute/`: trail assumptions (add, seed from the brief, challenge, confirm, settle) and reroute proposals: `validateReroute`, `rerouteDiff` (the dry run), `frozenTickets`, `applyReroute` (idempotent, resumable), the store and `rerouteTriggers` (signs a reroute may be needed).
- `projects/`: several repos in one Lookout: the registry file and `registerProject`, `projectSummary` (one repo at a glance, from its files only), `mergeAttention` (one queue across repos), `projectBriefing` (the away briefing per repo, via `buildBriefing`), `ProjectBridges` (full bridges started lazily, capped, closed when idle) and `insideRoot` (realpath confinement of file routes).
- `planning/matching/`: model-aware claiming: `tierOfModel` (a session's model to its tier, models.json first), `tierOfTicket` (the one place a ticket's tier is resolved, from the trail's `modelMatching`), `rankForSession` (own tier first, then lower, never higher), `modelWaits` (ready tickets no connected agent's tier reaches), the models.json parser and store. Turned on per trail with `setModelMatching` (trail lead only). Teamtrail never picks or switches a model.
- `attention/`: the attention queue. `buildAttention` ranks everything that needs the human (pure, explainable `reasons`), one source per kind in `attention/sources/` registered in `sources/registry.ts`, scoring, batching, the policy and prefs parsers, and `isInterrupting` (focus hours).
- `activity/`: the activity stream, presence and usage.
- `server/`: the HTTP bridge (`trackerBridge.ts`), its route handlers (`*Routes.ts`), `GET /models` (`modelRoutes.ts`), the projects hub in front of it (`projectsHub.ts`: `/projects` routes in `projectRoutes.ts`, `/p/<id>/…` forwarded to that project's bridge, the `projects` event from `watchProjects.ts`), the `/events` SSE stream and the background loops (`watchLeases.ts`, `watchVerification.ts`, `watchTrackerFolder.ts`, `watchAttention.ts`, `watchIntegration.ts`).

### MCP server (`packages/cli/src/mcp`)

- `server.ts` creates the server; `toolKit.ts` defines how tools are declared (zod schemas, results and errors).
- Tools are grouped in `tools/` (`trailTools.ts`, `ticketTools.ts`, `workTools.ts`, `hitlTools.ts`, `knowledgeTools.ts`, `rerouteTools.ts`, `projectTools.ts` with the read-only `projects_status`). Their behaviour lives in `trail/` (trail ops, ticket ops, HITL, completion, reviews, leases, sessions, the risk check, the attention summary, assumptions and reroutes, parallel work in `parallel.ts`, and model matching in `models.ts`).
- `instructions.ts` holds the server instructions every agent gets. `packages/cli/commands/scout.md` is the `/scout` command for Claude Code (and the Codex prompt).

### Lookout (`apps/lookout/src`)

- `App.tsx` lays out the zones. `app/` wires the header, map zone, laptop and phone layouts, and dialogs.
- `features/<feature>/` holds one folder per zone or dialog (inbox, map, inspector, activity, plan, decisions, briefing, settings, verification, …).
- Live updates: hooks that refetch when a tracker file changes subscribe through `lib/trackerChanges.ts` (one shared `/events` stream). Don't open a new `EventSource` per hook: browsers allow six connections per host, and requests queue behind open streams.
- `components/ui/` holds the design-system primitives, `hooks/` app-wide hooks (`useLookout.ts` loads data and subscribes to SSE), `lib/` helpers, and `styles/` the CSS per area (tokens in `styles/design-system.css`).
- Projects: `lib/apiBase.ts` gives the page's API base (`?project=<id>` → `/__teamtrail/p/<id>`, home keeps the un-prefixed API; switching projects reloads the page). `?item=<attention item id>` opens a queue item the way its inbox row would (`app/useItemLink.ts`); All projects links to items in other projects with it. `features/projects/` holds All projects, the header's project switcher, the phone home tab's list and the hooks; Settings → Projects is `features/settings/ProjectsSection.tsx`. With one project nothing of it shows.
- The in-app changelog is `features/settings/releases.ts`.

## Conventions

Follow `CONTRIBUTING.md`: one export per file, 200 lines max, the layout rules, inline type imports, naming, where tests and fixtures go, its **Readable code** rules (no nested ternaries, early returns, flat nesting, object parameters, small functions, explicit variants), and its **Presenting data** rules for the UI (three levels, four type roles, red only for "needs you now", say it once, lists built from `Row` and `MetaLine`). Lint enforces the mechanical ones; write the rest in the same spirit. Run `npm run format` on files you touch.

## Recipes

**Add an MCP tool.**
1. Declare it in the right `packages/cli/src/mcp/tools/*Tools.ts` with a zod schema, title and description; mark read-only tools `readOnly`.
2. Put the behaviour in `packages/cli/src/mcp/trail/`, with core logic in `packages/core` when it's more than glue.
3. Describe when to use it in `packages/cli/src/mcp/instructions.ts` and `packages/cli/commands/scout.md`.
4. Cover it in `packages/cli/test/` (`mcp*.test.ts`) and drive it end to end in `scripts/verify-mcp.mjs`.

**Add a bridge route and SSE event.**
1. Add a `handleX(req, res, ctx)` in `packages/core/src/server/<name>Routes.ts` that takes the shared `RouteContext` (`routeContext.ts`) and returns `true` when it handled the request, following `leaseRoutes.ts`.
2. Mount it in `trackerBridge.ts` next to the others.
3. Push changes with `send('event: x\ndata: …\n\n')` from a route or a loop (see `watchLeases.ts`), and subscribe in `apps/lookout/src/hooks/useLookout.ts`.
4. Trail lead-only actions are journaled.

**Add a journal entry kind.** Extend the entry types in `packages/core/src/model/lifecycle.ts` and keep the reader in `journalFile.ts` tolerant of unknown kinds. Old journals must still load. Add a test with a mixed old and new journal.

**Add a lookout zone, view or setting.**
1. Create `apps/lookout/src/features/<name>/` with an `index.ts` barrel, and styles in `styles/`.
2. Settings sections go in `features/settings/` (see `SettingsSection.tsx`); full views opened from the header follow `features/decisions/`.
3. Check the wide, laptop and phone layouts (`app/LaptopSide.tsx`, `app/PhoneView.tsx`). Zone titles carry an info tip (`components/ui/InfoTip.tsx`).

**Add a changelog entry.** Add a plain-language line to `NEXT` or the current release in `apps/lookout/src/features/settings/releases.ts`.

**Extend the end-to-end check.** `scripts/verify-mcp.mjs` drives a real trail through the built CLI and a browser. Add steps for new tools or UI, assert on what the user sees, and avoid timing races: wait on state, not sleeps.

## Checks

- `npm run check` runs everything CI runs: lint, the Prettier check, typecheck, build, the vitest and node:test suites, and `verify:mcp` (needs a build and Chrome; set `CHROME` to its path). It must pass before a PR.
- **Run the app on the dev seed:** `npm run dev` resets the dev project to the seed and starts the Lookout with hot reload. `npm run build -w teamtrail && npm run dev:agent` adds real MCP agents working it. `npm run dev:empty` starts on a brand-new empty tracker folder instead, for the first-run flow.
- `main` is protected: one PR per change, merged after CI passes. Releases are covered in `CONTRIBUTING.md`.
