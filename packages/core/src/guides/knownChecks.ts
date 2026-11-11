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
 */
export interface Shape {
  sub?: string[];
  needs?: string[];
  script?: RegExp;
  modules?: string[];
  exempt?: string[];
}

/** A relative path to a script inside the repo: no option, no absolute path, no `..`, no home folder. */
const inRepo = (ext: string) => new RegExp(`^(?![-/~\\\\])(?!.*\\.\\.)(?![a-zA-Z]:)[\\w./-]+\\.(${ext})$`);

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
  node: { script: inRepo('[cm]?[jt]s'), sub: ['--test'] },
  // python's own -c is caught by inlineCode.ts, which reads flags up to the module; after it, -c is the module's
  python: { script: inRepo('py'), modules: words('pytest unittest mypy ruff black flake8 pylint'), exempt: ['-c'] },
  pytest: { exempt: ['-c'] },
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
  rubocop: ANY,
  rspec: { exempt: ['-e'] },
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

/** A tool installed in the repo's node_modules: known only when the tool itself is on the list above. */
const LOCAL_BIN = /^(\.\/)?node_modules\/\.bin\/([\w.-]+)$/;

function fitsShape(shape: Shape, args: string[]): boolean {
  const first = args[0] ?? '';
  if (shape.needs && !args.some((a) => shape.needs!.includes(a))) return false;
  if (shape.script?.test(first)) return true;
  if (shape.modules) return first === '-m' && shape.modules.includes(args[1] ?? '');
  if (shape.sub) return shape.sub.includes(first);
  return true;
}

/** The known shape argv fits, if any: by the program, or by the tool a node_modules/.bin path names. */
export function knownShape(input: { argv0: string; program: string; args: string[] }): Shape | undefined {
  const bin = LOCAL_BIN.exec(input.argv0)?.[2];
  const shape = KNOWN_CHECKS[bin ?? input.program];
  return shape && fitsShape(shape, input.args) ? shape : undefined;
}

/** Whether argv is one of the known check shapes. */
export const isKnownCheck = (input: { argv0: string; program: string; args: string[] }) => !!knownShape(input);
