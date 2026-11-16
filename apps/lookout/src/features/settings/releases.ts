/**
 * Single source for the in-app Changelog tab, newest first. The newest release's version is the product version: it
 * must equal packages/cli/package.json (a test checks). A feature PR adds a release with a minor bump and 1–4 short,
 * user-facing lines; a fix PR bumps the patch. `NEXT` only teases what's coming.
 */
import { MID_RELEASES } from './midReleases';
import { OLDER_RELEASES } from './olderReleases';

export interface Release {
  version: string;
  date: string;
  items: string[];
}

export const NEXT: { area: string; items: string[] }[] = [
  {
    area: 'Teamtrail Cloud',
    items: ['The Lookout as an app on your phone, with a nudge only for the calls that need you'],
  },
];

export const RELEASES: Release[] = [
  {
    version: '0.52.0',
    date: '2026-11-16',
    items: [
      'Scope check: files an agent changed beyond the ones it said it would are listed first for whoever reviews',
      'Choose in Settings → Verification whether they are only shown, sent back for rework, or left for you to decide',
      'Proofs on pull requests say whether every change stayed inside the declared files',
    ],
  },
  {
    version: '0.51.0',
    date: '2026-11-16',
    items: [
      'Review limit: set how much finished work may wait for your review, and agents start no new work past it',
      'Agents finish rework and keep researching meanwhile, and Waiting on you shows what to review first',
      'Set it in Settings → Attention; in Teamtrail Cloud, workspace owners set it there too',
    ],
  },
  {
    version: '0.50.0',
    date: '2026-11-16',
    items: [
      'On the map, a done ticket’s check is green when its work is verified, grey when it isn’t',
      'Cards say “checks running” while a completion is checked, and a Legend explains the dots',
    ],
  },
  {
    version: '0.49.0',
    date: '2026-11-16',
    items: [
      'In Teamtrail Cloud, Start the trail right after New trail, or from the trail’s header: agents start in place',
      'A trail started in the Lookout gets your project’s default verification level, as one an agent starts does',
    ],
  },
  {
    version: '0.48.1',
    date: '2026-11-16',
    items: ['Scout’s Get started sits in the bottom-right corner; adding your own check shows examples'],
  },
  {
    version: '0.48.0',
    date: '2026-11-16',
    items: ['In Teamtrail Cloud, Scout keeps Get started in the corner until your workspace is set up'],
  },
  {
    version: '0.47.0',
    date: '2026-11-16',
    items: ['Set the checks every finished ticket must pass in Settings → Verification, no file to edit'],
  },
  {
    version: '0.46.0',
    date: '2026-11-16',
    items: [
      'In Teamtrail Cloud, Approve and merge on a verified ticket merges its pull request at the commit that was checked',
    ],
  },
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
  ...MID_RELEASES,
  ...OLDER_RELEASES,
];
