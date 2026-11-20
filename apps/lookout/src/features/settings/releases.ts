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
  {
    version: '0.67.5',
    date: '2026-11-20',
    items: [
      'Monorepos: give a check the paths it is about (Settings → Verification, prefilled for a workspace package), and a change outside them doesn’t run it',
      'Lockfiles, the top’s manifests and CI config still run every check, and so do checks on main; the proof says which checks were skipped and why',
    ],
  },
  {
    version: '0.67.4',
    date: '2026-11-20',
    items: [
      'A check counts as a tool Teamtrail knows only when it is found on your PATH or in the repo’s own tool folders (node_modules/.bin, .venv/bin, vendor/bin, gradlew, mvnw); a program elsewhere named pytest or jest asks you first',
    ],
  },
  {
    version: '0.67.3',
    date: '2026-11-20',
    items: ['The teamtrail wordmark ends in a blaze block cursor instead of a full stop'],
  },
  {
    version: '0.67.2',
    date: '2026-11-20',
    items: ['Guide icons are the symbol alone, on the page itself, with no tile or border around them'],
  },
  {
    version: '0.67.1',
    date: '2026-11-20',
    items: [
      'Scout, the logo and the guide icons are redrawn for the new look: Scout in graphite, white and blaze, square tiles, flat guide icons',
      'The favicon is the blaze t. tile, the same on light and dark browser tabs',
    ],
  },
  {
    version: '0.67.0',
    date: '2026-11-20',
    items: [
      'A new look: a dark-first Lookout with near-black surfaces, hairline borders, square corners and one blaze accent',
      'Inter and JetBrains Mono throughout; the map is a clean dot-grid canvas, and the path agents walked is drawn in blaze',
      'Colours keep one meaning each: blaze is work in progress and your selection, rose needs you, green is verified or done',
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
  ...RECENT_RELEASES,
  ...NEWER_RELEASES,
  ...LATER_RELEASES,
  ...MID_RELEASES,
  ...OLDER_RELEASES,
];
