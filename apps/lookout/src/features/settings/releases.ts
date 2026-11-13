/**
 * Single source for the in-app Changelog tab, newest first. The newest release's version is the product version: it
 * must equal packages/cli/package.json (a test checks). A feature PR adds a release with a minor bump and 1–4 short,
 * user-facing lines; a fix PR bumps the patch. `NEXT` only teases what's coming.
 */
import { OLDER_RELEASES } from './olderReleases';

export interface Release {
  version: string;
  date: string;
  items: string[];
}

export const NEXT: { area: string; items: string[] }[] = [
  { area: 'Teamtrail Cloud', items: ['Agents that run in the cloud, steered from the same Lookout'] },
];

export const RELEASES: Release[] = [
  {
    version: '0.31.1',
    date: '2026-11-13',
    items: ['An archived trail’s held work and changes waiting for your approval stay in your queue'],
  },
  {
    version: '0.31.0',
    date: '2026-11-13',
    items: [
      'Start a trail over: the trail menu archives the map that went wrong and opens New trail with its idea filled in',
      'Archive a trail you are done with, or restore it: it stays as history, and no agent takes work from it',
      'The empty map looks like every other empty zone, with New trail and the agent command under it',
    ],
  },
  {
    version: '0.30.0',
    date: '2026-11-12',
    items: [
      "Ask Scout more in Slack: “what's blocking #12?”, “what did we decide about retention?”, “who's working?”, as @Scout, a DM or /scout ticket, decisions and who",
      'In a channel, the answers are seen only by you',
    ],
  },
  {
    version: '0.29.3',
    date: '2026-11-12',
    items: ['@Scout inbox and status in a channel now show up right away, seen only by you'],
  },
  {
    version: '0.29.2',
    date: '2026-11-12',
    items: [
      'The Activity log reads in one style: a coloured bar marks what needs you (red), what went well (green) and what is held up (amber), and Slack answers show who gave them',
    ],
  },
  {
    version: '0.29.1',
    date: '2026-11-12',
    items: [
      'Scout says in Slack that it needs Teamtrail running on your computer, and how to start it, when it can’t reach yours',
      'Ask Scout in your own words: “@Scout what’s in my inbox?” or “status of Slack live test” work, in a channel or a DM',
    ],
  },
  {
    version: '0.29.0',
    date: '2026-11-12',
    items: [
      'Ask Scout in Slack: @Scout inbox or @Scout status in a channel answers only you, or DM Scout; if you added Scout before, Settings asks you to reconnect once',
      'A question your agent waits on gets its own Slack message with answer buttons, even right after it asked another one',
      'Scout can be installed straight from Slack (scout.teamtrail.app/install-slack); each person then connects in Settings → Slack',
    ],
  },
  {
    version: '0.28.0',
    date: '2026-11-12',
    items: [
      'Scout is now one Slack app: Settings → Slack → Add Scout to Slack, no app to create and no tokens to paste',
      'You confirm which Slack account becomes Scout’s owner before it connects; if you made your own Slack app before, add Scout again',
      'High-risk calls are answered in the Lookout only, and so is approving an agent’s request to change your settings: Slack shows Open in Lookout, and Decline still works there',
    ],
  },
  {
    version: '0.27.3',
    date: '2026-11-11',
    items: [
      'On Linux, the Lookout sees every change an agent makes to a ticket again, not only the first: a claimed ticket no longer stays in the queue as waiting',
    ],
  },
  {
    version: '0.27.2',
    date: '2026-11-11',
    items: [
      'Settings, briefs, criteria, guides, reroutes and the other panels stay current through reconnects, and a GitHub or Linear map updates live again',
    ],
  },
  {
    version: '0.27.1',
    date: '2026-11-11',
    items: ['The map and the queue no longer miss a change made while the Lookout was loading or reconnecting'],
  },
  {
    version: '0.27.0',
    date: '2026-11-11',
    items: [
      'Teamtrail opens your browser ready to sign in with one click; `teamtrail pair` does the same for another tab',
    ],
  },
  {
    version: '0.26.2',
    date: '2026-11-11',
    items: ['The Lookout shows the new teamtrail. wordmark'],
  },
  {
    version: '0.26.1',
    date: '2026-11-11',
    items: [
      'A refreshed logo: the trail’s destination is larger, and there are light and dark versions that follow your theme',
    ],
  },
  {
    version: '0.26.0',
    date: '2026-11-11',
    items: [
      'The Lookout asks you to sign in: open the link `teamtrail` prints, and pair your phone with a QR code (again after each restart)',
      'Your answers count only when you give them in the Lookout or Slack, and skipping discovery or changing a trail’s mode or destination waits for your Approve',
      'Check commands, briefs, criteria and other trusted settings run only once you approve them on this machine, in Settings → Approvals',
      'Changes made to trail files outside Teamtrail have no effect until you accept them',
    ],
  },
  {
    version: '0.25.0',
    date: '2026-11-10',
    items: [
      'Agents on other machines or in cloud sandboxes can join your trails: `teamtrail mcp --http` serves the same tools over HTTP',
      'One token per remote agent, created and revoked in Settings → Remote agents; without a token nothing is reachable',
      '`teamtrail connect claude|codex --url` points an agent at a remote Teamtrail',
    ],
  },
  {
    version: '0.24.2',
    date: '2026-11-10',
    items: ['A ticket’s description no longer repeats which trail it is part of'],
  },
  {
    version: '0.24.1',
    date: '2026-11-10',
    items: ['Buttons in the same row are always the same size'],
  },
  {
    version: '0.24.0',
    date: '2026-11-10',
    items: [
      'Focus in the header: see at a glance whether it is on, and start or end it in one click',
      'Sign in with GitHub, and pick your repo or Linear team from a searchable list',
      'Write your own guides with `teamtrail guides new`, approve them in Settings and share them with the catalog',
      'Settings is its own page, and the trail map has a cleaner, flatter look',
      'Smaller polish: one colour for work in progress everywhere, a calmer first run and clearer Slack setup',
    ],
  },
  {
    version: '0.23.0',
    date: '2026-11-08',
    items: [
      'Match work to models: switch it on for a trail in Settings and each agent gets the tickets that fit the model it runs on, research on fast models and junctions on the strongest. You set the tier per ticket type; Teamtrail never switches a model, and a ticket no connected agent is strong enough for waits in your queue',
      'Guides: a ticket can ask for a reviewer, QA, security, docs or architect, and the agent that claims it gets that guide’s instructions and a checklist it must answer before the work counts as done. Pick a trail’s team and each ticket’s guide in the Lookout, and add more guides from a moderated catalog in Settings → Guides. A guide can add checks but never remove one, its commands only run after you approve them, and a guide file edited after you approved it is switched off until you look at it again',
      "Records has a new Trail stats view: delivery across every trail, by vendor, agent and ticket type, with plain observations from your own numbers. Teamtrail doesn't route work from them",
      'MILOOPS is now Teamtrail. Missions are trails, the command center is the Lookout, MILO is Scout, and `/milo` is `/scout`',
      'More room for the map: the summary of counts now slides up from a tab when you want it',
      'A new day and night look, starting in night, with an Appearance setting to switch to day or follow your system',
      'The map is now a landscape: tickets are trail signs, the trail shows what is walked and what is ahead, and an X marks the destination',
      'A new greeting when you start `teamtrail` in a terminal',
      'A new logo, a t whose stem runs along a trail to a node, and a new look for Scout: the original CRT head with ear cups and a baseball cap, with a lamp on the cap at night. No more pixel art, and new fonts too',
      "All projects: every repo you supervise in one view, with one list of what needs you across them and what changed while you were away. Answer an agent's question in any repo from there, and switch projects from the header. Agents add their repo when they connect (`--no-register` opts out), or add one with `teamtrail projects add`",
    ],
  },
  {
    version: '0.22.0',
    date: '2026-11-05',
    items: [
      'A calmer, clearer command center: every list now reads the same way, what it is first, then one quiet line of context, and details when you want them',
      'Red now only means something needs you now; other states show as a thin edge instead of colored text everywhere',
      'The open question in a conversation can no longer be hidden by its suggested answers, and the phone header no longer runs off the side',
    ],
  },
  {
    version: '0.21.0',
    date: '2026-11-05',
    items: [
      'New plans can now edit a ticket, remove a dependency and reopen finished work, instead of working around it',
      "Slack digests follow the team's digest setting (digestMinutes in attention.json); 0 turns them off, and everything still waits in Waiting on you",
      "Remove a finished task's workspace from Settings → Workspaces or the ticket; the branch stays, and MILOOPS asks before discarding uncommitted changes",
    ],
  },
  ...OLDER_RELEASES,
];
