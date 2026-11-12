<img src="brand/teamtrail-banner.gif" alt="The teamtrail wordmark, ending in an orange dot, above a dashed trail through the mountains that reaches the same orange destination." width="100%" />

# Teamtrail

> You pick the destination. Your agents walk the trail.

[![CI](https://img.shields.io/github/actions/workflow/status/teamtrailhq/teamtrail/ci.yml?branch=main&label=CI)](https://github.com/teamtrailhq/teamtrail/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/teamtrail/next?label=npm%40next)](https://www.npmjs.com/package/teamtrail?activeTab=versions)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-server-555)](https://modelcontextprotocol.io)
[![Works with Claude Code and Codex](https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Codex-555)](packages/cli/README.md#connect-your-coding-agent)
[![License: FSL-1.1-ALv2](https://img.shields.io/badge/license-FSL--1.1--ALv2-blue)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/teamtrailhq/teamtrail?style=social)](https://github.com/teamtrailhq/teamtrail/stargazers)

**[teamtrail.app](https://teamtrail.app)** · [Docs](https://teamtrail.app/docs/) · [Try it: `npx teamtrail@next`](https://www.npmjs.com/package/teamtrail?activeTab=versions)

Teamtrail is a local trail map for planning and executing big work with your AI coding agents. You describe a trail; your agents chart it as decision tickets, work through them, and bring the calls that need you to a single inbox. Scout, the Lookout's trail lead, briefs you on what changed while you were away and keeps spend and token usage in view.

- **Trails and decision tickets:** a live map of what's decided, in progress, blocked and out of scope.
- **Waiting on you:** every question from every agent, in one inbox, answered in-window.
- **Decision records:** each call is written down with its alternatives, rationale and transcript.
- **Live spend:** per-session and per-trail tokens and cost.
- **Your data stays yours:** trails are plain markdown in `./.teamtrail/` in your repo. Nothing leaves your machine.

Works with any coding agent that connects over MCP. Claude Code and Codex are the primary supported agents.

## Why Teamtrail

Your agents can already write the code. What's missing is a place to run them like a team: one where you set the direction, they do the work, and you make the calls that matter.

- **Bring any agent.** Everything runs through MCP tools. Claude Code today, Codex tomorrow, both at once. Teamtrail never calls a model itself and never locks you into a vendor.
- **Local-first, for real.** Trails live as plain files in your repo's `.teamtrail/` folder, or in the GitHub Issues or Linear tracker you already use. There is no Teamtrail server, and there never will be.
- **A deterministic core.** Lifecycle, state and ranking are code, not prompts. The same inputs always give the same result, so you can trust what the map tells you.
- **Evidence over claims.** Agents bring the decisions that matter to you, with the alternatives and the reasoning, and you decide. Less babysitting, not less judgment.
- **Not another activity feed.** Teamtrail isn't a prettier log of what agents did. It's where work gets steered.

## Roadmap

Where Teamtrail is heading, in the order we plan to build it:

1. **Multi-repository supervision.** Run trails across all your repos from one Lookout, with a single merged queue.
2. **Agent roles and guides.** Give agents roles (reviewer, researcher, builder) and bring in guides for focused jobs, starting with a built-in reviewer that wraps today's independent review.

Already shipped from this roadmap: one ranked queue of what needs you, project knowledge, trails that adapt when an assumption breaks, safe parallel work (a separate workspace per task, and a warning before two agents change the same files), and Trail stats (delivery across trails by vendor, agent and ticket type).

Coming alongside: **model-aware claiming**, a per-trail switch that sends hard decisions to stronger models and routine work to cheaper ones. With roles, a role can set its own model tier.

## Install

Requires Node 20+.

```bash
npm i -g teamtrail      # or, without installing: npx teamtrail
cd your-repo
teamtrail
```

`teamtrail` opens the Lookout in your browser. Run `teamtrail --help` for options.

Connect your agent once, then use `/scout new "<idea>"`, `/scout resume`, `/scout status` and `/scout inbox`:

```bash
claude mcp add teamtrail -- npx -y teamtrail mcp   # Claude Code; `npx teamtrail connect claude` also adds /scout
codex mcp add teamtrail -- npx -y teamtrail mcp    # Codex; see packages/cli for the config.toml entry
```

Details for both agents are in [`packages/cli/README.md`](packages/cli/README.md#connect-your-coding-agent).

## Repository

| Path | Package | |
| --- | --- | --- |
| [`packages/core`](packages/core) | `@teamtrail/core` | UI-free engine: trails, tickets, trackers, metrics, decision records |
| [`packages/cli`](packages/cli) | [`teamtrail`](https://www.npmjs.com/package/teamtrail) | The `teamtrail` command: serves the Lookout and the tracker API |
| [`packages/scout-avatar`](packages/scout-avatar) | `@teamtrail/scout-avatar` | Pixel-art Scout avatar (React component and framework-free renderer) |
| [`apps/lookout`](apps/lookout) | private | The lookout web UI bundled into the CLI |
| [`brand`](brand) | | Logos, avatars and social images |

The landing site lives in [teamtrailhq/teamtrail-landing](https://github.com/teamtrailhq/teamtrail-landing).

## Develop

```bash
npm install
npm run dev           # resets the dev project to the seed, then the Lookout with hot reload
npm run dev:agent     # real MCP agents working the dev project (after npm run build -w teamtrail)
npm run dev:empty     # the Lookout on a brand-new empty folder: the first-run, no-trail flow
npm run typecheck     # every workspace
npm test              # unit and MCP tests (vitest)
npm run verify:mcp    # after a build: an MCP client drives a trail while the Lookout shows it
npm run build         # every workspace; the CLI lands in packages/cli/dist
npm start             # run the built CLI (same as `teamtrail`)
npm run lint          # ESLint across the monorepo
npm run check         # lint, typecheck, build, test and verify:mcp; run before opening a PR
```

See [`apps/lookout/README.md`](apps/lookout/README.md) for the architecture, metrics and tracker API, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for code standards.

## License

[FSL-1.1-ALv2](LICENSE) (Functional Source License, Apache 2.0 future license): free to use, modify and run, including at work, for anything except a competing product. Each release becomes Apache 2.0 two years after it ships. Third-party credits are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
