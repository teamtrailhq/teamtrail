import type { Release } from './releases';

/** Releases 0.1–0.10, kept apart so `olderReleases.ts` stays short. Newest first. */
export const EARLIEST_RELEASES: Release[] = [
  {
    version: '0.10.0',
    date: '2026-10-31',
    items: [
      'MCP server in the miloops package: `claude mcp add miloops -- npx -y miloops-cli mcp`, or the same for Codex',
      'Connected agents start and resume missions, claim ready tickets, report steps, tokens and spend, close tickets and record decisions, live in the command center',
      'Agent questions land in Waiting on you and the agent waits for your answer; answer in the command center or in the agent chat',
      '/milo new, resume, status and inbox commands for Claude Code (and as a Codex prompt); `miloops connect claude|codex` sets them up',
      'The command center follows a mission an agent just charted; sessions of agents that quit show as disconnected',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-10-31',
    items: [
      'While you were away: MILO briefs you when you open the app or come back after being away: tickets done, now blocked, decisions waiting on you, agent decisions, spend and tokens since, active sessions',
      'Briefing shows on return after 15 minutes hidden or idle; change the threshold or turn it off in Settings; reopen it from the header',
      'Last seen per mission and usage over time are kept locally, so the briefing survives a reload',
      'Mission title shows in full at laptop width; header readouts collapse to glyph and count',
      'Prototype reviews link a real preview build and ask about the spike results',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-31',
    items: [
      'Decisions: every decision across missions, newest first, with question, decision, alternatives, rationale, who decided and the full transcript',
      'Filter decisions by mission, source, who decided and status; search; export to markdown',
      'Supersede a decision; the chain stays visible on every record and in the mission',
      'Decision records stored as markdown next to each mission and served by the local API with a live event stream',
      'Resolve form: rationale and alternatives considered',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-31',
    items: [
      'New type: Chakra Petch, Share Tech Mono and Barlow',
      'Calmer palette; bright colour only for warnings and waiting on you',
      'MILO mark, also used for status, action and alert glyphs',
      'Dot-matrix signals for new decision requests and mission launches',
      'Separate type voices for operators and agents',
      'One-command install: npm i -g miloops-cli, then miloops in any repo',
      'Packages renamed to @miloops-hq/core and @miloops-hq/command-center',
    ],
  },
  ...EARLIEST_RELEASES,
  {
    version: '0.6.0',
    date: '2026-10-31',
    items: [
      'Named MILOOPS; MILO speaks for the platform in the activity log and onboarding',
      'Tracker sync status, last-write latency and event pulse',
      'Inbox: oldest question age and average wait',
      'Critical path, decided per hour with burndown, type mix',
      'Per-session tokens and cost, mission totals, claims per agent',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-31',
    items: [
      'Status counters and resolution bar on the map',
      'Current step tracker with step pipeline',
      'Sessions with live timers',
      'Activity log with time and source columns',
      'Out-of-scope quarantine zone on the map',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-31',
    items: [
      'Missions: switcher with progress and waiting count, New mission in the switcher',
      'Inbox collects questions from every mission',
      'Elapsed time and progress per mission',
      'Responsive layout with progressive disclosure (wide, laptop, phone)',
      'Map graph pans and zooms by drag, pinch and wheel',
      'Changelog',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-31',
    items: ['Fixed-zone layout', 'Plan + execute and plan-only mission modes', 'Execute tickets'],
  },
  {
    version: '0.2.0',
    date: '2026-10-31',
    items: [
      'Local markdown tracker (default)',
      'Onboarding',
      'HITL transcript: summary or full',
      'Settings with tracker connectors',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-31',
    items: [
      'Live map graph',
      'HITL vs AFK tickets',
      'In-window HITL conversations',
      'Demo tracker with simulated sessions',
    ],
  },
];
