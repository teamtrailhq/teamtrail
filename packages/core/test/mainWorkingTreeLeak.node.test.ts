import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runMainHere } from '../src/mainChecks/runMainHere';
import { parseVerificationConfig } from '../src/verification/config';
import { tempFolder } from './tempFolder';

/*
 * Checks on main must test the commit on main, never the person's uncommitted work. Two layouts where a dependency
 * folder points back into the working tree: an npm workspace (`node_modules/@x/lib` links to `packages/lib`) and a
 * Python editable install (a `.pth` file in `.venv` names the working tree's `src`). The working tree differs from
 * the commit; the check prints what it imported.
 */

function gitIn(repo: string) {
  return (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' });
}

function write(repo: string, rel: string, text: string) {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), text);
}

function config(checks: Record<string, unknown>, setup?: Record<string, unknown>) {
  const text = JSON.stringify({ v: 1, checks, run: Object.keys(checks), ...(setup ? { setup } : {}) });
  return parseVerificationConfig(text).config!;
}

async function runOnMain(repo: string, checks: Record<string, unknown>, setup?: Record<string, unknown>) {
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root, { recursive: true });
  const id = `M-leak-${Date.now()}`;
  const out = await runMainHere({
    root,
    repoRoot: repo,
    id,
    config: config(checks, setup),
    names: Object.keys(checks),
  });
  const logs = out.checks.map((c) => (c.log ? readFileSync(path.join(root, c.log), 'utf8') : c.tail)).join('\n');
  return { out, logs };
}

/** The lockfile `npm install` writes for this workspace: one linked package, nothing from a registry. */
const LOCK = {
  name: 'root',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'root', workspaces: ['packages/*'] },
    'node_modules/@x/lib': { resolved: 'packages/lib', link: true },
    'packages/lib': { name: '@x/lib', version: '1.0.0' },
  },
};

function npmWorkspace() {
  const repo = path.join(tempFolder('teamtrail-main-leak-npm-'), 'app');
  const git = gitIn(repo);
  write(repo, 'package.json', JSON.stringify({ name: 'root', private: true, workspaces: ['packages/*'] }));
  write(repo, 'packages/lib/package.json', JSON.stringify({ name: '@x/lib', version: '1.0.0', main: 'index.js' }));
  write(repo, 'packages/lib/index.js', "module.exports = 'committed';\n");
  write(
    repo,
    'check.js',
    "const v = require('@x/lib'); console.log('lib is ' + v); process.exit(v === 'committed' ? 0 : 1);\n",
  );
  write(repo, 'package-lock.json', JSON.stringify(LOCK));
  write(repo, '.gitignore', 'node_modules\n.teamtrail\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  // what `npm install` makes for a workspace package: a relative link into the working tree
  mkdirSync(path.join(repo, 'node_modules/@x'), { recursive: true });
  symlinkSync('../../packages/lib', path.join(repo, 'node_modules/@x/lib'), 'dir');
  // the person's uncommitted work
  write(repo, 'packages/lib/index.js', "module.exports = 'uncommitted';\n");
  return repo;
}

function pythonEditable() {
  const repo = path.join(tempFolder('teamtrail-main-leak-py-'), 'app');
  const git = gitIn(repo);
  write(repo, 'src/pkg/__init__.py', "VALUE = 'committed'\n");
  write(
    repo,
    'check.py',
    "import pkg, sys\nprint('pkg is ' + pkg.VALUE)\nsys.exit(0 if pkg.VALUE == 'committed' else 1)\n",
  );
  write(repo, '.gitignore', '.venv\n.teamtrail\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  execFileSync('python3', ['-m', 'venv', '--without-pip', path.join(repo, '.venv')], { stdio: 'pipe' });
  const lib = path.join(repo, '.venv/lib');
  const site = path.join(
    lib,
    readdirSync(lib).find((n) => n.startsWith('python'))!,
    'site-packages',
  );
  // what `pip install -e .` leaves: a .pth naming the working tree's source folder
  writeFileSync(path.join(site, '__editable__.pkg-0.pth'), `${path.join(repo, 'src')}\n`);
  write(repo, 'src/pkg/__init__.py', "VALUE = 'uncommitted'\n");
  return repo;
}

function hasPython() {
  try {
    execFileSync('python3', ['-c', 'import venv'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const CHECK = { test: { run: [process.execPath, 'check.js'] } };

test('checks on main never import a workspace package from the working tree', async () => {
  const repo = npmWorkspace();
  const { out, logs } = await runOnMain(repo, CHECK);
  assert.doesNotMatch(logs, /lib is uncommitted/, 'the check ran the working tree, not main');
  // nothing installed for main: the check can't find the package, which is this machine's doing, not main's
  assert.equal(out.result, 'fail');
  assert.match(out.checks[0].environment ?? '', /package @x\/lib isn't installed here/);
  assert.match(out.note ?? '', /No setup steps are approved/);
});

test('with an approved npm ci, checks on main import the workspace package as committed', async () => {
  const repo = npmWorkspace();
  const setup = { deps: { run: ['npm', 'ci', '--offline', '--no-audit', '--no-fund'] } };
  const { out, logs } = await runOnMain(repo, CHECK, setup);
  assert.deepEqual(
    out.setup?.map((s) => [s.name, s.passed]),
    [['deps', true]],
  );
  assert.match(logs, /lib is committed/);
  assert.equal(out.result, 'pass');
  // the person's own node_modules is theirs as it was
  assert.equal(readlinkSync(path.join(repo, 'node_modules/@x/lib')), '../../packages/lib');
});

test('a setup step Teamtrail does not run fails setup, and no check runs', async () => {
  const repo = npmWorkspace();
  const setup = { deps: { run: ['npm', 'install', 'left-pad'] } };
  const { out } = await runOnMain(repo, CHECK, setup);
  assert.equal(out.result, 'unavailable');
  assert.deepEqual(out.checks, []);
  assert.match(out.setup?.[0].refused ?? '', /isn't a frozen install/);
  assert.match(out.note ?? '', /^setup failed: npm install left-pad wasn't run/);
});

test('checks on main never import an editable install from the working tree', { skip: !hasPython() }, async () => {
  const repo = pythonEditable();
  const { out, logs } = await runOnMain(repo, { test: { run: ['.venv/bin/python', 'check.py'] } });
  assert.doesNotMatch(logs, /pkg is uncommitted/, 'the check ran the working tree, not main');
  // no .venv in the worktree for main: the program isn't there
  assert.equal(out.result, 'fail');
  assert.match(out.checks[0].environment ?? '', /python isn't installed here/);
});
