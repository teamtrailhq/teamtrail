import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { prepareWorktree } from '../src/workspaces/prepareWorktree';
import { DEFAULT_WORKSPACE_SETTINGS } from '../src/workspaces/workspace';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

/*
 * Approved setup steps in a ticket's worktree: run once when Teamtrail makes it, from the verification.json the trail
 * lead approved here, never in the person's own checkout.
 */

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
const NPM_CI = { run: ['npm', 'ci', '--offline', '--no-audit', '--no-fund'] };

function project(setup: Record<string, unknown>) {
  const top = path.join(tempFolder('teamtrail-setup-wt-'), 'app');
  const root = path.join(top, '.teamtrail');
  const write = (rel: string, v: unknown) => {
    mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
    writeFileSync(path.join(top, rel), typeof v === 'string' ? v : JSON.stringify(v));
  };
  write('package.json', { name: 'root', private: true, workspaces: ['packages/*'] });
  write('packages/lib/package.json', { name: '@x/lib', version: '1.0.0' });
  write('package-lock.json', LOCK);
  write('.gitignore', 'node_modules\n.teamtrail\n');
  write('.teamtrail/verification.json', { v: 1, checks: {}, run: [], setup });
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: top, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  return { top, root };
}

const prepare = (o: { top: string; root: string }, id: string) =>
  prepareWorktree({
    root: o.root,
    repoRoot: o.top,
    settings: { ...DEFAULT_WORKSPACE_SETTINGS, worktrees: true },
    mapId: 'm1',
    ticket: { id, key: `#${id}` },
    agent: 'claude-01',
  });

test("a new ticket worktree gets the approved setup steps, once, and the person's checkout gets nothing", async () => {
  const p = project({ deps: NPM_CI });
  approveAllHere(p.root);
  const made = await prepare(p, '1');
  assert.ok('workspace' in made, 'note' in made ? made.note : '');
  assert.deepEqual(
    made.setup?.steps.map((s) => [s.name, s.passed]),
    [['deps', true]],
  );
  assert.ok(lstatSync(path.join(made.workspace.path, 'node_modules/@x/lib')).isSymbolicLink());
  assert.ok(existsSync(path.join(p.root, made.setup!.steps[0].log!)));
  assert.equal(existsSync(path.join(p.top, 'node_modules')), false);
  // claiming again reuses the worktree: nothing runs twice
  const again = await prepare(p, '1');
  assert.ok('workspace' in again);
  assert.equal(again.setup, undefined);
});

test('setup steps nobody approved here never run: the approved file is the one used', async () => {
  const p = project({});
  approveAllHere(p.root);
  // an agent adds an install to the file after the trail lead approved it
  const file = path.join(p.root, 'verification.json');
  const text = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...text, setup: { deps: NPM_CI } }));
  const made = await prepare(p, '2');
  assert.ok('workspace' in made);
  assert.equal(made.setup, undefined);
  assert.equal(existsSync(path.join(made.workspace.path, 'node_modules')), false);
});

test('a refused setup step is reported and not run', async () => {
  const p = project({ deps: { run: ['npm', 'install'] } });
  approveAllHere(p.root);
  const made = await prepare(p, '3');
  assert.ok('workspace' in made);
  assert.match(made.setup?.failed ?? '', /npm install wasn't run: isn't a frozen install/);
  assert.equal(existsSync(path.join(made.workspace.path, 'node_modules')), false);
});
