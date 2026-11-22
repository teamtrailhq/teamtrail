import type { Release } from './releases';

/** Releases 0.66.13–0.67.5, kept apart so `releases.ts` stays short (0.61–0.66.12 in `newerReleases.ts`). Newest first. */
export const RECENT_RELEASES: Release[] = [
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
];
