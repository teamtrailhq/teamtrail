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
    version: '0.66.23',
    date: '2026-11-19',
    items: [
      'Monorepos: give a check the paths it is about (Settings → Verification, prefilled for a workspace package), and a change outside them doesn’t run it',
      'Lockfiles, the top’s manifests and CI config still run every check, and so do checks on main; the proof says which checks were skipped and why',
    ],
  },
  {
    version: '0.66.22',
    date: '2026-11-19',
    items: [
      'Settings → Verification suggests the checks your repo actually runs, read from its files (Node, Python, Go, Rust, Java, Ruby, PHP, .NET), each with its folder, one click to add',
      'Each check has a folder, so a monorepo can test apps/web in apps/web; saving still approves it',
    ],
  },
  {
    version: '0.66.21',
    date: '2026-11-19',
    items: [
      'The check guard knows more stacks: Cargo, Gradle, Maven, .NET, Ruby, PHP, Swift, Elixir and Dart configs, and skipped tests in each (#[ignore], @Disabled, Skip =, markTestSkipped, xit, XCTSkip, @tag :skip…)',
      'It follows turbo and Nx into the scripts and targets they run, and reads through bundle exec, poetry run, uv run and composer scripts',
    ],
  },
  {
    version: '0.66.20',
    date: '2026-11-19',
    items: [
      'Checks on main test the commit on main: your own node_modules and .venv are no longer linked in, since workspace packages and editable installs in them can point to your uncommitted code',
      'Setup steps in verification.json (npm ci, uv sync --frozen and other installs from a lockfile) run in the worktrees Teamtrail prepares, never in your checkout, after you approve them with the checks',
      "When checks on main fail because something isn't installed or reachable on this machine, Teamtrail says so and agents aren't held, instead of asking you to fix main",
    ],
  },
  {
    version: '0.66.19',
    date: '2026-11-19',
    items: [
      "Check screening knows more stacks: Gradle and Maven wrappers, Python's uv, Poetry and Pipenv, Bundler, Composer, bun, turbo and Nx, Swift, Mix and Dart, and the workspace `-w` or `--filter` names",
      "A check that needs something not installed yet says so (`ng` isn't installed: no node_modules in apps/web), apart from a script that doesn't exist",
      'Checks may run a known tool through `uv run --frozen`, `poetry run`, `pipenv run`, `bundle exec`, `pnpm exec` or `npx --no`; anything that would download stays refused',
    ],
  },
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
  ...NEWER_RELEASES,
  ...LATER_RELEASES,
  ...MID_RELEASES,
  ...OLDER_RELEASES,
];
