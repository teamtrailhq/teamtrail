/**
 * Single source for the in-app Changelog tab, newest first. The newest release's version is the product version: it
 * must equal packages/cli/package.json (a test checks). A feature PR adds a release with a minor bump and 1–4 short,
 * user-facing lines; a fix PR bumps the patch. `NEXT` only teases what's coming.
 */
import { LATER_RELEASES } from './laterReleases';
import { MID_RELEASES } from './midReleases';
import { NEWER_RELEASES } from './newerReleases';
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
    version: '0.66.18',
    date: '2026-11-19',
    items: [
      'Checks read as running until their outcome is in place: once they show finished, the ticket has moved on and its review is open',
    ],
  },
  {
    version: '0.66.17',
    date: '2026-11-19',
    items: [
      "An answer passed on from an agent's chat no longer takes the place of yours: it guides the agent, and the question stays open in the Lookout and Slack until you answer, and your answer is the one that decides",
    ],
  },
  {
    version: '0.66.16',
    date: '2026-11-19',
    items: [
      'Hands-off on a phone: every kind of Needs you fits the screen, with actions big enough to tap, and each row acts on what it asks',
      'Teamtrail Cloud: Pause shows Stopping… until the agents have stopped, and Start shows Starting… until one is working',
    ],
  },
  {
    version: '0.66.15',
    date: '2026-11-19',
    items: [
      'Two answers to the same question at once (the Lookout and Slack, or two people): the first is the one used everywhere, and the other is kept in the conversation as "also answered, not used"',
    ],
  },
  {
    version: '0.66.14',
    date: '2026-11-19',
    items: ['Running the tests no longer leaves folders behind in the temp folder'],
  },
  {
    version: '0.66.13',
    date: '2026-11-19',
    items: ["Checking a proof finds the repo's proof keys when the repo is reached through a symbolic link"],
  },
  {
    version: '0.66.12',
    date: '2026-11-19',
    items: [
      'GitHub and Linear: a write the tracker refuses for good (lost access, a deleted issue) waits for you in the queue, with Retry and Discard',
    ],
  },
  {
    version: '0.66.11',
    date: '2026-11-19',
    items: [
      "A ticket's pull request block has Link a different PR and Unlink; a PR you link stays linked",
      'Closing or reopening a ticket updates its pull request and the review queue within seconds',
      "Removing a ticket takes its proof's green status off its pull request",
    ],
  },
  {
    version: '0.66.10',
    date: '2026-11-19',
    items: ['Settings no longer has an About page'],
  },
  {
    version: '0.66.9',
    date: '2026-11-19',
    items: ['Settings → Gates and Diff rules say why their controls are off before the controls, not after'],
  },
  {
    version: '0.66.8',
    date: '2026-11-18',
    items: [
      "GitHub and Linear: a claim or status change no longer overwrites a teammate's edit, and two agents can't both win a claim",
      'GitHub and Linear: changes are never missed after a failed poll or a busy minute, and archived, renamed or deleted trails show',
      'Accepting tracker settings ends the wait for completions at once, and agents follow a new repo, team or token without a restart',
    ],
  },
  {
    version: '0.66.7',
    date: '2026-11-18',
    items: [
      'Agents are only pointed to work they can take: closing a ticket or resuming a trail no longer suggests one that waits on you, and says what it waits for',
      'An agent that closes the discovery ticket before writing the brief is told to submit the brief, so the trail no longer stalls',
      "Agents asked about your other projects no longer report nothing waiting in a GitHub or Linear project whose tickets they can't read",
    ],
  },
  {
    version: '0.66.6',
    date: '2026-11-18',
    items: [
      'A ticket reopened after its proof was posted takes the green Teamtrail proof off its pull request, and a proof that names no commit never passes',
      'A pull request closed and replaced by a new one on the same branch: the ticket follows the new one, and a trail whose work closed unmerged or was reverted no longer says Destination reached',
      'A pull request waiting to merge says what stands in its way: a draft, conflicts, changes requested or its checks',
      "The review limit no longer holds agents back for deleted tickets or a PR sync that isn't running, and PR sync asks GitHub less as your history grows",
    ],
  },
  {
    version: '0.66.5',
    date: '2026-11-18',
    items: [
      'An approval made in another tab, on another device or with teamtrail approve shows on every open page at once',
      'Check marks, Destination reached and the decisions list follow evidence and decision files that change on their own, git pull included',
    ],
  },
  {
    version: '0.66.4',
    date: '2026-11-18',
    items: [
      'Slack: each question’s card shows its own answer; one passed on in an agent’s chat says it decided nothing',
      'Slack: archiving a trail no longer closes cards for what still waits on you, and a card that becomes high risk switches to Open in Lookout',
      'Checks on main run again when main moves after a failure, and say so meanwhile; trail checks read reverts on the commit they run on',
    ],
  },
  {
    version: '0.66.3',
    date: '2026-11-18',
    items: [
      'A merged pull request shows as merged on its ticket as soon as it merges, and nothing offers to merge it again',
      'Teamtrail Cloud: checks on main run on your repository’s main, never on a commit from somewhere else',
    ],
  },
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
  ...NEWER_RELEASES,
  ...LATER_RELEASES,
  ...MID_RELEASES,
  ...OLDER_RELEASES,
];
