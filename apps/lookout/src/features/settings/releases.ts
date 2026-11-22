/**
 * Single source for the in-app Changelog tab, newest first. The newest release's version is the product version: it
 * must equal packages/cli/package.json (a test checks). A feature PR adds a release with a minor bump and 1–4 short,
 * user-facing lines; a fix PR bumps the patch. `NEXT` only teases what's coming.
 */
import { LATER_RELEASES } from './laterReleases';
import { MID_RELEASES } from './midReleases';
import { NEWER_RELEASES } from './newerReleases';
import { OLDER_RELEASES } from './olderReleases';
import { RECENT_RELEASES } from './recentReleases';

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
    version: '0.73.0',
    date: '2026-11-22',
    items: [
      'A new repo works the same in Teamtrail Cloud: its setup ticket proposes the checks, and readiness says what Cloud can run',
      'The setup ticket finishes by itself once you approve its checks, and the trail tells you to merge the setup work first',
    ],
  },
  {
    version: '0.72.0',
    date: '2026-11-22',
    items: [
      'A new repo starts with a setup ticket: the agent sets the project up and proposes its checks, you approve them, and they check the setup work too',
      'The rest of the trail waits until checks are approved, so nothing in a new repo finishes unchecked',
    ],
  },
  {
    version: '0.71.1',
    date: '2026-11-22',
    items: ['In Teamtrail Cloud, the header shows the Teamtrail logo alone'],
  },
  {
    version: '0.71.0',
    date: '2026-11-22',
    items: [
      'Settings read faster: each section opens with one line and the points you need, the rest under Learn more',
      'The ticket bubble on the map grows with the map, so long tickets read in wider lines',
    ],
  },
  {
    version: '0.70.0',
    date: '2026-11-21',
    items: [
      'A new wordmark: the logo before the name, in the Lookout, on the sign-in page and across the brand images',
    ],
  },
  {
    version: '0.69.0',
    date: '2026-11-21',
    items: ['A new logo: six block cursors around an open centre, on a transparent background, in the browser tab too'],
  },
  {
    version: '0.68.1',
    date: '2026-11-21',
    items: [],
  },
  {
    version: '0.68.0',
    date: '2026-11-21',
    items: [
      'A new look across the Lookout: the map, Needs you, the ticket bubble and its proof, Plan, Activity, the Logbook and Settings now read the same way, what needs you first',
      "Activity shows each agent's lane with its milestones instead of a raw log",
      "The Logbook lets you keep an agent's own decision or overrule it in place",
      'Settings says when a change was saved and journaled, and approvals show what changed line by line',
    ],
  },
  {
    version: '0.67.22',
    date: '2026-11-20',
    items: [
      "Teamtrail Cloud: Get started's strip says Powered by Teamtrail on its left, so it no longer reads as empty",
    ],
  },
  {
    version: '0.67.21',
    date: '2026-11-20',
    items: [
      "Teamtrail Cloud: Merge anyway works on a ticket finished with no checks set, at the pull request's head you see; if it gets new commits first, you're asked to review again",
    ],
  },
  {
    version: '0.67.20',
    date: '2026-11-20',
    items: [
      "Teamtrail Cloud: a done ticket's bubble offers Approve and merge, or Merge anyway, as its next step",
      'A ticket finished while no checks were set says so, with Set checks, instead of "no completion was submitted"',
    ],
  },
  {
    version: '0.67.19',
    date: '2026-11-20',
    items: [
      "Teamtrail Cloud: Scout's Get started keeps its own corner, so it never covers Send or a button again",
      "In Hands-off, the full ticket has Back, and Esc and your browser's Back return you where you were",
      'Starting a trail before any checks are set says so, with Set checks',
    ],
  },
  {
    version: '0.67.18',
    date: '2026-11-20',
    items: [
      "The map's destination is a finish square: it fills green when the trail is verified, rose when its checks fail",
    ],
  },
  {
    version: '0.67.17',
    date: '2026-11-20',
    items: ["When Scout in Slack can't reach your Teamtrail, it tells you to start it with `npx teamtrail`"],
  },
  {
    version: '0.67.16',
    date: '2026-11-20',
    items: [
      'A long question from an agent leads with a one-line headline, with the question in full under it and its line breaks kept',
    ],
  },
  {
    version: '0.67.15',
    date: '2026-11-20',
    items: ["A new logo: the t's path runs to a blaze cursor, the wordmark's own, in the browser tab too"],
  },
  {
    version: '0.67.14',
    date: '2026-11-20',
    items: ["Deleting an answer file can't put a later answer in its place: the question waits for you again"],
  },
  {
    version: '0.67.13',
    date: '2026-11-20',
    items: ['Checkboxes are their usual size again, in the reroute dialog too'],
  },
  {
    version: '0.67.12',
    date: '2026-11-20',
    items: [
      "A question answered in an agent's chat leaves Needs you, unless a HITL ticket or a high-risk call still needs your answer in the Lookout",
    ],
  },
  {
    version: '0.67.11',
    date: '2026-11-20',
    items: ['The tracker line in Settings stops counting a refused write once you retry or discard it'],
  },
  {
    version: '0.67.10',
    date: '2026-11-20',
    items: [],
  },
  {
    version: '0.67.9',
    date: '2026-11-20',
    items: [
      'The guide catalog page has the new look: the teamtrail wordmark with its blaze cursor, Inter and blaze, by day and by night',
    ],
  },
  {
    version: '0.67.8',
    date: '2026-11-20',
    items: [
      'Settings → Project → Check variables lists the variables checks can read, the ones your tests seem to need and which they would not get; add a name there instead of TEAMTRAIL_CHECK_ENV (names only: values still come from your shell)',
      "A name that reads like a credential is added only after you confirm it: any code your checks run, agents' included, can read it",
      'Checks also get Go, Gradle, Maven, Rust, uv, pip, Poetry, Composer, .NET, mise, asdf and Cypress cache and toolchain folders',
    ],
  },
  {
    version: '0.67.7',
    date: '2026-11-20',
    items: [
      'Field guide → Suggest build and test notes reads your repo and writes one note per package on how to install, build, test and run it',
      'Once you confirm a note, every claim in that package carries it, with the setup and checks Teamtrail runs and what its tests need',
    ],
  },
  {
    version: '0.67.6',
    date: '2026-11-20',
    items: [
      'Settings → Project → Repo readiness says whether Teamtrail can check work in your repo on this machine: checks, programs, installs, a browser, services and variable names, with a fix in one click where it is an approval',
      'While something blocks, agents start no new implementation work until you fix it or start the trail anyway; research and reviews go on, and Undo is one click',
    ],
  },
  ...RECENT_RELEASES,
  ...NEWER_RELEASES,
  ...LATER_RELEASES,
  ...MID_RELEASES,
  ...OLDER_RELEASES,
];
