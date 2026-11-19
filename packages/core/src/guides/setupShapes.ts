/*
 * The setup steps Teamtrail runs: installs from the repo's own lockfile that can't change it or add a package. Each
 * shape is a program, its subcommand, the flags one of which it must have (what makes it frozen), the flags it may
 * have, and the lockfiles one of which must be in the step's folder. Nothing else runs as setup: no URLs, no package
 * names, no `npm install`, no shells.
 */

export interface SetupShape {
  program: string;
  /** The words after the program, in order: `ci`, `mod download`. */
  sub: string[];
  /** One of these must be given; empty when the subcommand itself is frozen (`npm ci`). */
  frozen: string[];
  /** Other flags it may take, exactly as written (`--omit=dev`). */
  flags: string[];
  /** One of these must be a file in the step's folder. */
  lockfiles: string[];
  /** How the shape is shown: `npm ci`, `uv sync --frozen`. */
  label: string;
}

const NODE_FLAGS = ['--ignore-scripts', '--prefer-offline', '--offline', '--no-audit', '--no-fund', '--no-progress'];

export const SETUP_SHAPES: SetupShape[] = [
  {
    program: 'npm',
    sub: ['ci'],
    frozen: [],
    flags: [...NODE_FLAGS, '--include=dev', '--omit=dev', '--omit=optional', '--omit=peer', '--foreground-scripts'],
    lockfiles: ['package-lock.json', 'npm-shrinkwrap.json'],
    label: 'npm ci',
  },
  {
    program: 'pnpm',
    sub: ['install'],
    frozen: ['--frozen-lockfile'],
    flags: [...NODE_FLAGS, '--prod', '--dev'],
    lockfiles: ['pnpm-lock.yaml'],
    label: 'pnpm install --frozen-lockfile',
  },
  {
    program: 'yarn',
    sub: ['install'],
    frozen: ['--immutable', '--frozen-lockfile'],
    flags: [...NODE_FLAGS, '--non-interactive', '--production'],
    lockfiles: ['yarn.lock'],
    label: 'yarn install --immutable',
  },
  {
    program: 'bun',
    sub: ['install'],
    frozen: ['--frozen-lockfile'],
    flags: ['--ignore-scripts', '--production', '--no-progress'],
    lockfiles: ['bun.lock', 'bun.lockb'],
    label: 'bun install --frozen-lockfile',
  },
  {
    program: 'uv',
    sub: ['sync'],
    frozen: ['--frozen', '--locked'],
    flags: ['--all-extras', '--all-groups', '--all-packages', '--dev', '--no-dev', '--no-install-project'],
    lockfiles: ['uv.lock'],
    label: 'uv sync --frozen',
  },
  {
    program: 'poetry',
    sub: ['install'],
    frozen: [],
    flags: ['--no-root', '--sync', '--no-interaction', '-n', '--all-extras', '--no-ansi'],
    lockfiles: ['poetry.lock'],
    label: 'poetry install --no-root --sync',
  },
  {
    program: 'poetry',
    sub: ['sync'],
    frozen: [],
    flags: ['--no-root', '--no-interaction', '-n', '--all-extras', '--no-ansi'],
    lockfiles: ['poetry.lock'],
    label: 'poetry sync',
  },
  {
    program: 'bundle',
    sub: ['install'],
    frozen: ['--frozen', '--deployment'],
    flags: ['--quiet', '--local', '--prefer-local'],
    lockfiles: ['Gemfile.lock'],
    label: 'bundle install --frozen',
  },
  {
    program: 'go',
    sub: ['mod', 'download'],
    frozen: [],
    flags: ['-x'],
    lockfiles: ['go.mod'],
    label: 'go mod download',
  },
  {
    program: 'cargo',
    sub: ['fetch'],
    frozen: ['--locked', '--frozen'],
    flags: ['--quiet', '-q'],
    lockfiles: ['Cargo.lock'],
    label: 'cargo fetch --locked',
  },
  {
    program: 'composer',
    sub: ['install'],
    frozen: ['--no-interaction', '-n'],
    flags: ['--no-scripts', '--prefer-dist', '--no-progress', '--no-dev', '--no-plugins'],
    lockfiles: ['composer.lock'],
    label: 'composer install --no-interaction',
  },
  {
    program: 'dotnet',
    sub: ['restore'],
    frozen: ['--locked-mode'],
    flags: ['--nologo'],
    lockfiles: ['packages.lock.json'],
    label: 'dotnet restore --locked-mode',
  },
];
