/**
 * Single source for the in-app Changelog tab, newest first. The newest release's version is the product version: it
 * must equal packages/cli/package.json (a test checks). A feature PR adds a release with a minor bump and 1–4 short,
 * user-facing lines; a fix PR bumps the patch. `NEXT` only teases what's coming.
 */
import { LATER_RELEASES } from './laterReleases';
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
    version: '0.66.2',
    date: '2026-11-18',
    items: [
      'Agents pick up work the moment you confirm criteria, approve the plan or free the review limit, instead of checking back minutes later',
      'Needs you keeps long titles and reasons inside their card at every width, with Read more for long reasons',
    ],
  },
  {
    version: '0.66.1',
    date: '2026-11-18',
    items: [
      'On a phone, the header keeps one row: the mode switch, what needs you and More, with focus, records, Settings and the theme',
      'Teamtrail Cloud: a pull request says why auto-merge waits, or that it merged by itself',
    ],
  },
  {
    version: '0.66.0',
    date: '2026-11-18',
    items: [
      'Hands-off, for everyone by default: what needs you in one list, the trail’s progress and what happened since you were away; Hands-on is the map as before',
      'Answer, approve and confirm from the list itself; the full ticket is one click away',
      'Approve the plan in one step: the brief and every ticket’s criteria, as shown',
      'Switch in the header or Settings → You; agents decide and work is verified exactly as before',
    ],
  },
  {
    version: '0.65.0',
    date: '2026-11-18',
    items: [
      'Done means verified: work that passed against criteria you never confirmed waits for you, and confirming checks it again by itself',
      'Criteria charted with a ticket are yours to confirm before any agent starts it',
      'Every proof gap says who is on it, and what closes it when it is yours: Confirm criteria and verify again, Approve, Send to rework',
      'The pull request up top in the ticket and on its map card; the full ticket’s actions sit flush at the bottom',
    ],
  },
  {
    version: '0.64.3',
    date: '2026-11-18',
    items: [
      'Fix: a trail whose discovery research is done no longer shows Destination reached before its plan is charted',
      'Fix: trails and tickets created at the same time never get the same number',
    ],
  },
  {
    version: '0.64.2',
    date: '2026-11-18',
    items: ['Two trails with the same title no longer share a folder'],
  },
  {
    version: '0.64.1',
    date: '2026-11-18',
    items: [
      'Fix: what you open while the Lookout is still loading stays open; what needs you no longer opens over it on its own',
      'Fix: changing a gate twice in quick succession no longer refuses the second change as stale',
    ],
  },
  {
    version: '0.64.0',
    date: '2026-11-18',
    items: [
      'New trail is a large editor: the destination and notes can be whole markdown documents, with Write and Preview, full screen on a phone',
      'Load from file (or drop one on the field) puts a .md or .txt file in the destination or notes, to edit before you create',
      'Assumptions are one per line, and the dialog says how many it will create',
      'The header keeps the destination to its first sentence; Plan → Destination and Notes show them in full, as markdown',
    ],
  },
  {
    version: '0.63.1',
    date: '2026-11-18',
    items: ['At night, trail cards stand out from the map: a raised grey card, its chips in darker wells'],
  },
  {
    version: '0.63.0',
    date: '2026-11-18',
    items: [
      'Tickets read as their agents wrote them: lists, bold, code and links, in the bubble and the full ticket',
      'Every ticket has the same shape: its title and chips (state, agent and model, verified, risk), then What, Acceptance criteria, How, Progress, Proof and History, and its actions at the end',
      'Merge anyway shows only on done work with something to merge, never on a research ticket',
      'A ticket that needs you says so in red, says what is asked, and its first button does it; in the dark theme, the ticket and menus sit on a lighter sheet over the map',
    ],
  },
  {
    version: '0.62.0',
    date: '2026-11-18',
    items: [
      'Map, Plan, Activity and Logbook sit in a bar of their own under the header',
      'The map runs a chain of tickets in a straight line, from main to the destination, with a review beside the ticket it reviews',
      'Legend has a background, like Fit',
    ],
  },
  {
    version: '0.61.2',
    date: '2026-11-18',
    items: [
      'Went without a diff rule by mistake? Undo it in the ticket, and the rule asks again on the next completion',
      "Where a ticket's work started is kept on your machine, not in the repo, so an agent can't move it to slip a change past the check guard",
      'In Teamtrail Cloud, a trail is checked on exactly the commit Teamtrail names on main',
    ],
  },
  {
    version: '0.61.1',
    date: '2026-11-18',
    items: [
      'A trail with many tickets side by side lays them out in a grid, in order of number, instead of one tall column',
    ],
  },
  {
    version: '0.61.0',
    date: '2026-11-18',
    items: [
      "A pass counts only when the work didn't change what the check runs, skip or delete tests, or pass only on a retry",
      'A trail is verified only when your checks pass again on main with every ticket merged',
      'Reviews go first to an agent on another model, and rules you write ask agents about the files they touch',
      'Settings → This trail → Gates: try each gate in Observe first; the scorecard shows verified work that came back',
    ],
  },
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
  ...LATER_RELEASES,
  ...MID_RELEASES,
  ...OLDER_RELEASES,
];
