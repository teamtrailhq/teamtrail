import type { Release } from './releases';

/** Releases 0.27.3–0.45.0, kept apart so `releases.ts` stays short. Newest first. */
export const MID_RELEASES: Release[] = [
  {
    version: '0.45.0',
    date: '2026-11-16',
    items: ['In Teamtrail Cloud, Run agents on the trail takes you straight to its agents'],
  },
  {
    version: '0.44.2',
    date: '2026-11-16',
    items: ['The middle of the Lookout gets the same margin at the top as at its sides'],
  },
  {
    version: '0.44.1',
    date: '2026-11-16',
    items: ['Text you type in forms is full size (14px) again, not the small caps of the label above it'],
  },
  {
    version: '0.44.0',
    date: '2026-11-16',
    items: ['In a hosted Lookout, the theme toggle and Settings → Appearance change your theme on the server too'],
  },
  {
    version: '0.43.1',
    date: '2026-11-15',
    items: [
      'In a hosted Lookout that keeps your trails itself, Settings → Tracker says so instead of offering trackers',
    ],
  },
  {
    version: '0.43.0',
    date: '2026-11-15',
    items: [
      'Where the server runs your agents, the Lookout says to turn them on for a trail there, instead of offering /scout commands for an agent of your own',
    ],
  },
  {
    version: '0.42.0',
    date: '2026-11-15',
    items: [
      'A hosted Lookout has your menu in its header: back to all your workspaces, the server’s own pages, and Sign out',
      'Where the server keeps your trails itself, the Lookout asks no tracker questions on its first run',
    ],
  },
  {
    version: '0.41.0',
    date: '2026-11-15',
    items: [
      'In a hosted Lookout, someone who may not make high-risk calls sees who can answer or approve one, instead of a box that would turn their answer away',
    ],
  },
  {
    version: '0.40.0',
    date: '2026-11-15',
    items: [
      'Decisions now say who made the call: your name from git on this machine, or the person signed in to a hosted Lookout, in the Logbook and in Verified by Teamtrail proofs',
      'A hosted Lookout opens in the theme you picked in your account there',
    ],
  },
  {
    version: '0.39.0',
    date: '2026-11-15',
    items: [
      "A server that hosts Teamtrail can run a remote agent's checks on its pushed work, so that work is verified and its proof counts, like work done on your machine",
    ],
  },
  {
    version: '0.38.0',
    date: '2026-11-15',
    items: [
      'Decision memory: before an agent asks you something you already decided, Teamtrail hands it your earlier decision instead, and shows it next to the question if the agent asks anyway',
      'Waiting on you flags finished work that changes files one of your decisions covers, so a later change never quietly undoes it',
      "The Logbook groups decisions by area, the most cited first; share a project's decisions with your other projects in Settings → Projects",
    ],
  },
  {
    version: '0.37.0',
    date: '2026-11-15',
    items: [
      'Trail stats has a Scorecard: how each model, agent and vendor does on your own tickets, verified first time, rework and cost per verified ticket, with small samples marked too few',
      'Settings → Model matching suggests a tier per ticket type when one model clearly does better on your repo, with the numbers; nothing changes until you take it',
      'Copy the scorecard as Markdown to share it with your team',
    ],
  },
  {
    version: '0.36.0',
    date: '2026-11-15',
    items: [
      "Proof reports are signed with your machine's key: commit the key file Teamtrail writes in .teamtrail/proof-keys, and anyone can check a report with `teamtrail proof verify`",
      "A GitHub Action, Verified by Teamtrail, checks every proof on a pull request and can be made a required check, so a PR without a valid proof can't merge",
      'The ticket inspector shows the proof, with Copy for PR and a link to the comment once it is posted',
    ],
  },
  {
    version: '0.35.0',
    date: '2026-11-15',
    items: [
      "Settings → Project → Proof on pull requests: switch it on and Teamtrail posts each done ticket's report on its open pull request, updating the same comment as things change",
      'A Teamtrail proof check sits next to CI on the pull request and passes only when the ticket is verified at its latest commit',
    ],
  },
  {
    version: '0.34.0',
    date: '2026-11-15',
    items: [
      "Verified by Teamtrail: `teamtrail proof <ticket>` prints what Teamtrail recorded about a ticket's completion (the checks it ran, criteria verified or only claimed, the review and the decisions it relies on), ready for a pull request",
      'Agents get the same report from the new `proof_report` tool and put it in their pull requests',
      'The report opens with a Teamtrail verified or not verified badge',
    ],
  },
  {
    version: '0.33.1',
    date: '2026-11-14',
    items: ['Teamtrail is now MIT licensed'],
  },
  {
    version: '0.33.0',
    date: '2026-11-14',
    items: [
      "`teamtrail connect claude` offers to turn on Claude Code's sandbox, so the agent's shell commands can't reach Teamtrail's config folder either",
    ],
  },
  {
    version: '0.32.0',
    date: '2026-11-13',
    items: [
      'Scout has a new look: a scout companion with a cap, a headset and an antenna, looking out along the trail',
    ],
  },
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
];
