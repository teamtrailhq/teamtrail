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
    version: '0.55.2',
    date: '2026-11-16',
    items: ['Teamtrail Cloud: the agents menu says which model your agents are working on'],
  },
  {
    version: '0.55.1',
    date: '2026-11-16',
    items: ['Teamtrail Cloud: Get started ticks off your trail and your agents as soon as you start them'],
  },
  {
    version: '0.55.0',
    date: '2026-11-16',
    items: [
      'A finished trail looks finished: the stretches you walked turn solid green, and a flag stands where the X was',
      'Destination reached, once per trail, with a way to the pull requests still waiting to be merged',
      'Done but not verified stays honest: a grey flag, and how many tickets were closed without a verified proof',
    ],
  },
  {
    version: '0.54.0',
    date: '2026-11-16',
    items: [
      'When discovery ends, the Lookout tells you research is done and opens the brief for your review',
      'A brief waiting for your review counts in Waiting on you',
      'Tickets held until you accept the brief show as waiting on it, on the map and in Up next, not as ready',
    ],
  },
  {
    version: '0.53.1',
    date: '2026-11-16',
    items: [
      'A quieter header: tracker and CI show only when they fail, spend once there is any, and Plan only / Plan + execute moves into the trail menu',
    ],
  },
  {
    version: '0.53.0',
    date: '2026-11-16',
    items: [
      "Your trail's agents are one header menu: what they're doing, with Pause and Runs inside",
      'Legend sits next to Summary under the map, no longer behind it',
    ],
  },
  {
    version: '0.52.2',
    date: '2026-11-16',
    items: ['Teamtrail Cloud: Scout and Get started show in the corner of the Lookout again'],
  },
  {
    version: '0.52.1',
    date: '2026-11-16',
    items: ['Start the trail is a full-size button, like Create trail, and closes New trail once your agents are on'],
  },
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
  ...MID_RELEASES,
  ...OLDER_RELEASES,
];
