import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { dependencyFolders } from '../src/mainChecks/dependencyFolders';
import { prepareMainWorktree, removeMainWorktree } from '../src/mainChecks/mainWorktree';
import { tempFolder } from './tempFolder';

/**
 * A repo laid out like one whose web app has its own package.json and lockfile (no npm workspaces): the root holds only
 * scripts, `apps/web/node_modules` holds eslint.
 */
function nestedRepo() {
  const base = tempFolder('teamtrail-main-deps-');
  const repo = path.join(base, 'app');
  const outside = path.join(base, 'elsewhere', 'node_modules');
  mkdirSync(outside, { recursive: true });
  const dirs = ['node_modules/a', 'apps/web/node_modules/eslint', 'apps/api/.venv/bin', 'a/b/c/d/node_modules/x'];
  dirs.push(
    'a/b/c/d/e/node_modules/too-deep',
    'apps/web/node_modules/nested/node_modules/never',
    'untracked/node_modules',
  );
  for (const d of dirs) mkdirSync(path.join(repo, d), { recursive: true });
  mkdirSync(path.join(repo, 'apps/linked'), { recursive: true });
  symlinkSync(outside, path.join(repo, 'apps/linked/node_modules'), 'dir');
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n.venv\n.teamtrail\nuntracked\n');
  for (const p of ['apps/web/package.json', 'apps/api/pyproject.toml', 'apps/linked/package.json', 'a/b/c/d/x.txt']) {
    writeFileSync(path.join(repo, p), '{}');
  }
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  return { repo, commit: git('rev-parse', 'HEAD').toString().trim() };
}

test('dependency folders: the root and nested package folders, four levels at most, none that leaves the repo', () => {
  const { repo } = nestedRepo();
  assert.deepEqual(dependencyFolders(repo).sort(), [
    'a/b/c/d/node_modules',
    'apps/api/.venv',
    'apps/web/node_modules',
    'node_modules',
    'untracked/node_modules',
  ]);
});

test('checks on main get the nested node_modules linked in where the folder is tracked in git', async () => {
  const { repo, commit } = nestedRepo();
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root, { recursive: true });
  const wt = await prepareMainWorktree({ root, top: repo, commit, id: 'run-nested-1' });
  assert.ok('path' in wt, 'note' in wt ? wt.note : '');
  const rel = (p: string) => path.relative(wt.path, p);
  assert.deepEqual(wt.links.map(rel).sort(), [
    'a/b/c/d/node_modules',
    'apps/api/.venv',
    'apps/web/node_modules',
    'node_modules',
  ]);
  assert.ok(existsSync(path.join(wt.path, 'apps/web/node_modules/eslint')));
  // a folder git doesn't track has no place in the worktree; a link out of the repo is never made
  assert.equal(existsSync(path.join(wt.path, 'untracked')), false);
  assert.equal(lstatSync(path.join(wt.path, 'apps/linked/node_modules'), { throwIfNoEntry: false }), undefined);
  await removeMainWorktree({ root, top: repo, id: 'run-nested-1', links: wt.links });
  assert.equal(existsSync(wt.path), false);
  assert.ok(existsSync(path.join(repo, 'apps/web/node_modules/eslint')));
});
