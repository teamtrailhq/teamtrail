import type { Release } from './releases';

/** Releases 0.61–0.66.5, kept apart so `releases.ts` stays short (0.45–0.60 in `laterReleases.ts`). Newest first. */
export const NEWER_RELEASES: Release[] = [
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
];
