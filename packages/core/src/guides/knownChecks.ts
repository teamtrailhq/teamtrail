/*
 * The checks Teamtrail knows: test runners, linters, type checkers, formatters in check mode and build tools, each by
 * the shape of its argv. A known shape is no error and needs nothing more than the person's approval; what it runs
 * from the repo (npm scripts, Makefiles, test files) is covered by that approval, not by the lint. Anything else that
 * isn't refused outright is unknown: Teamtrail can't tell what it runs, so it's approved only with an acknowledgement.
 *   sub      the first argument must be one of these (no flags before it, so `npm --yes exec` is never `npm`)
 *   needs    one of these arguments must be present (`prettier --check`)
 *   script   a relative path to a script in the repo may come first (`node checks/a11y.js`)
 *   modules  `-m <module>` with one of these modules (`python -m pytest`)
 */
interface Shape {
  sub?: string[];
  needs?: string[];
  script?: RegExp;
  modules?: string[];
}

const ANY: Shape = {};
const words = (s: string) => s.split(/\s+/).filter(Boolean);

export const KNOWN_CHECKS: Record<string, Shape> = {
  npm: { sub: words('test t run run-script') },
  pnpm: { sub: words('test t run') },
  yarn: { sub: words('test run') },
  bun: { sub: words('test run') },
  make: ANY,
  cargo: { sub: words('test check clippy build fmt') },
  go: { sub: words('test vet build') },
  deno: { sub: words('test lint check') },
  node: { script: /^(?!-)(?!.*\.\.)[\w./-]+\.(c|m)?(j|t)s$/, sub: ['--test'] },
  python: { script: /^(?!-)(?!.*\.\.)[\w./-]+\.py$/, modules: words('pytest unittest mypy ruff black flake8 pylint') },
  pytest: ANY,
  ruff: { sub: words('check format') },
  mypy: ANY,
  pyright: ANY,
  black: { needs: ['--check'] },
  flake8: ANY,
  pylint: ANY,
  tsc: ANY,
  eslint: ANY,
  prettier: { needs: words('--check -c --list-different -l') },
  biome: { sub: words('check lint ci') },
  jest: ANY,
  vitest: ANY,
  mocha: ANY,
  playwright: { sub: ['test'] },
  rubocop: ANY,
  rspec: ANY,
  phpunit: ANY,
  phpstan: ANY,
  'golangci-lint': { sub: ['run'] },
  swift: { sub: words('test build') },
  dotnet: { sub: words('test build') },
  mvn: { sub: words('test verify compile') },
  gradle: { sub: words('test check build') },
  gradlew: { sub: words('test check build') },
  git: { sub: ['diff'] },
};

/** A tool installed in the repo's node_modules: its own code, which the repo's lockfile pins. */
const LOCAL_BIN = /^(\.\/)?node_modules\/\.bin\/[\w.-]+$/;

function fitsShape(shape: Shape, args: string[]): boolean {
  const first = args[0] ?? '';
  if (shape.needs && !args.some((a) => shape.needs!.includes(a))) return false;
  if (shape.script?.test(first)) return true;
  if (shape.modules) return first === '-m' && shape.modules.includes(args[1] ?? '');
  if (shape.sub) return shape.sub.includes(first);
  return true;
}

/** Whether argv is one of the known check shapes. */
export function isKnownCheck(input: { argv0: string; program: string; args: string[] }): boolean {
  if (LOCAL_BIN.test(input.argv0)) return true;
  const shape = KNOWN_CHECKS[input.program];
  return !!shape && fitsShape(shape, input.args);
}
