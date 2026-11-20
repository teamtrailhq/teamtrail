import { pmRoute, type JsPackageManager } from '../verification/pmRoute';
import { BUILD_TASKS, fitsTasks, type BuildTasks } from './buildTasks';
import { knownProgram } from './programIdentity';

/*
 * The checks Teamtrail knows: test runners, linters, type checkers, formatters in check mode and build tools, each by
 * the shape of its argv. A known shape is no error and needs nothing more than the person's approval; what it runs
 * from the repo (npm scripts, Makefiles, test files) is covered by that approval, not by the lint. Anything else that
 * isn't refused outright is unknown: Teamtrail can't tell what it runs, so it's approved only with an acknowledgement.
 *   sub      the first argument must be one of these (no flags before it, so `npm --yes exec` is never `npm`)
 *   needs    one of these arguments must be present (`prettier --check`)
 *   script   a relative path to a script in the repo may come first (`node checks/a11y.js`)
 *   modules  `-m <module>` with one of these modules (`python -m pytest`)
 *   exempt   flags that usually mean "run this code" but are data for this tool (`pytest -c pytest.ini`), so the
 *            generic run-this-code check (argRules.ts) skips them for it
 *   tasks    a build tool's tasks, in any order among its flags (buildTasks.ts)
 * A package manager's routing flags (`npm -w web test`, `pnpm --filter web lint`) are read away first (pmRoute.ts),
 * and a wrapper's tool (`uv run --frozen pytest`) is judged as a check of its own (wrappedCheck.ts).
 */
export interface Shape {
  sub?: string[];
  needs?: string[];
  script?: RegExp;
  modules?: string[];
  exempt?: string[];
  tasks?: BuildTasks;
}

/** A relative path to a script inside the repo: no option, no absolute path, no `..`, no home folder. */
const inRepo = (ext: string) => new RegExp(`^(?![-/~\\\\])(?!.*\\.\\.)(?![a-zA-Z]:)[\\w./-]+\\.(${ext})$`);

const ANY: Shape = {};
const words = (s: string) => s.split(/\s+/).filter(Boolean);

export const KNOWN_CHECKS: Record<string, Shape> = {
  npm: { sub: words('test t run run-script') },
  pnpm: { sub: words('test t run'), exempt: ['-r'] },
  yarn: { sub: words('test run') },
  bun: { sub: words('test run') },
  make: ANY,
  rake: ANY,
  cargo: { sub: words('test check clippy build fmt nextest') },
  go: { sub: words('test vet build') },
  deno: { sub: words('test lint check task') },
  node: { script: inRepo('[cm]?[jt]s'), sub: ['--test'] },
  // python's own -c is caught by inlineCode.ts, which reads flags up to the module; after it, -c is the module's
  python: {
    script: inRepo('py'),
    modules: words('pytest unittest mypy ruff black flake8 pylint pyright isort'),
    exempt: ['-c'],
  },
  pytest: { exempt: ['-c'] },
  tox: { exempt: ['-e', '-c'] },
  nox: ANY,
  isort: { needs: words('--check --check-only -c --diff'), exempt: ['-c'] },
  ruff: { sub: words('check format') },
  mypy: ANY,
  pyright: ANY,
  black: { needs: ['--check'] },
  flake8: ANY,
  pylint: ANY,
  tsc: ANY,
  eslint: { exempt: ['-c'] },
  'pa11y-ci': ANY,
  prettier: { needs: words('--check -c --list-different -l') },
  biome: { sub: words('check lint ci') },
  jest: { exempt: ['-c'] },
  vitest: ANY,
  mocha: ANY,
  playwright: { sub: ['test'] },
  ng: { sub: words('test lint build e2e') },
  nx: { sub: words('run run-many affected test lint build e2e typecheck') },
  turbo: { sub: words('run test lint build typecheck check') },
  rubocop: ANY,
  rspec: { exempt: ['-e'] },
  rails: { sub: words('test test:system') },
  phpunit: ANY,
  phpstan: ANY,
  psalm: ANY,
  phpcs: ANY,
  pint: { needs: ['--test'] },
  'php-cs-fixer': { needs: ['--dry-run'] },
  php: { script: /^(artisan|(?![-/~\\])(?!.*\.\.)[\w./-]+\.php)$/ },
  composer: { sub: words('test run-script run validate') },
  'golangci-lint': { sub: ['run'] },
  swift: { sub: words('test build') },
  swiftlint: ANY,
  mix: { sub: words('test compile credo') },
  dart: { sub: words('test analyze') },
  flutter: { sub: words('test analyze') },
  dotnet: { sub: words('test build') },
  mvn: { tasks: BUILD_TASKS.mvn, exempt: ['-e'] },
  mvnw: { tasks: BUILD_TASKS.mvnw, exempt: ['-e'] },
  gradle: { tasks: BUILD_TASKS.gradle },
  gradlew: { tasks: BUILD_TASKS.gradlew },
  git: { sub: ['diff'] },
};

function fitsShape(shape: Shape, args: string[]): boolean {
  const first = args[0] ?? '';
  if (shape.tasks) return fitsTasks(shape.tasks, args);
  if (shape.needs && !args.some((a) => shape.needs!.includes(a))) return false;
  if (shape.script?.test(first)) return true;
  if (shape.modules) return first === '-m' && shape.modules.includes(args[1] ?? '');
  if (shape.sub) return shape.sub.includes(first);
  return true;
}

const PACKAGE_MANAGERS = new Set<string>(['npm', 'pnpm', 'yarn', 'bun']);

/** A package manager's words without its routing flags (`npm -w web test` → `test`); other programs' as they are. */
const routed = (program: string, args: string[]) =>
  PACKAGE_MANAGERS.has(program) ? pmRoute(program as JsPackageManager, args).words : args;

/** A program as a check names it: argv0 and the folder it runs in (repo-relative), then its words. */
export interface CheckProgram {
  argv0: string;
  args: string[];
  cwd?: string;
}

/**
 * The known shape argv fits, if any. The program counts by its name only when it's a bare name found on PATH or a
 * path into the repo's own tool folders (programIdentity.ts): `/tmp/x/pytest` or `../x/jest` is no known check.
 */
export function knownShape(input: CheckProgram): Shape | undefined {
  const program = knownProgram(input.argv0, input.cwd);
  const shape = program ? KNOWN_CHECKS[program] : undefined;
  return program && shape && fitsShape(shape, routed(program, input.args)) ? shape : undefined;
}

/** Whether argv is one of the known check shapes. */
export const isKnownCheck = (input: CheckProgram) => !!knownShape(input);
