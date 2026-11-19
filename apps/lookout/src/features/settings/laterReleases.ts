import type { Release } from './releases';

/** Releases 0.45.1–0.60.0, kept apart so `releases.ts` stays short (0.27.3–0.45.0 in `midReleases.ts`). Newest first. */
export const LATER_RELEASES: Release[] = [
  {
    version: '0.60.0',
    date: '2026-11-17',
    items: [
      'The map takes the page: click a ticket and a bubble opens beside it, with what it needs from you first, then the ticket',
      'Under the map, the trail bar: every ticket at a glance, what needs you, and More for agents at work and what is next',
      'Cards move while something happens: waiting for an agent, an agent at work with its model and step, a halo when it needs you',
      'Plan, Activity and the Logbook are pages of their own, from the tabs in the header',
    ],
  },
  {
    version: '0.59.4',
    date: '2026-11-17',
    items: [
      'A check that fails only as it already does on main no longer sends the first completion back for rework when an acceptance criterion names it',
      "Where Teamtrail merges pull requests, a done ticket that isn't verified offers Merge anyway: why in one line, one question, and it's kept as your decision",
      'A done ticket whose pull request is still open shows in your queue as ready to merge',
    ],
  },
  {
    version: '0.59.3',
    date: '2026-11-17',
    items: [
      'Checks on main find the dependencies of a package folder with its own install, like apps/web/node_modules',
      'An agent held by checks failing on main tells you to choose in the Lookout, instead of asking you a question',
    ],
  },
  {
    version: '0.59.2',
    date: '2026-11-17',
    items: [
      'Settings → Verification reads calmer: one line per check, a warning under its command with the fix one click away, and Save apart',
    ],
  },
  {
    version: '0.59.1',
    date: '2026-11-17',
    items: [
      "A check like `npm web:lint`, a command npm doesn't have, is now flagged, with `npm run web:lint` suggested",
    ],
  },
  {
    version: '0.59.0',
    date: '2026-11-17',
    items: [
      "A check that can't pass in your repo no longer strands a ticket: Accept without it, with your reason. The other checks run again, the proof shows who skipped it and why, and Undo puts it back",
      "Setting or approving checks now says which ones can't run as your repo is (a missing script, no go.mod, a missing make target), with Remove check or Keep anyway",
    ],
  },
  {
    version: '0.58.0',
    date: '2026-11-17',
    items: [
      'Before agents build, the approved checks run once on the default branch, so a check already failing on main is known before any agent is blamed for it',
      'When one fails, the trail waits for your call: fix main first, drop that check for the trail, or start anyway. Each can be undone',
      'After Start anyway, a completion that fails only in those checks, the same way, isn’t sent back, and its proof marks them as known failures, not verified',
      'Run checks on main again any time, from the trail at a glance or Settings → Verification',
    ],
  },
  {
    version: '0.57.0',
    date: '2026-11-17',
    items: [
      'A ticket says where it stands first: who has it, or what it waits on, with the one thing to do next as a button',
      'Every ticket action sits in one bar under it; the rest of the ticket reads as What, How, Progress, Proof and History, with details a click away',
      'With no ticket selected, Trail step shows the trail at a glance: its phase, what waits on you, what each agent is on, and what is ready next',
    ],
  },
  {
    version: '0.56.0',
    date: '2026-11-17',
    items: [
      'Guides come with the ticket type: the architect on research, junctions and prototypes, QA and security on tasks, the reviewer on reviews. Change them per trail in Settings → Guides by type, your own guides included',
      'A ticket can take several guides: add or remove one for that ticket alone in the inspector',
      'A guide you add while an agent works reaches it at its next report, and its checklist counts at completion',
    ],
  },
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
];
