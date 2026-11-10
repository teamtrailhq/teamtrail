import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { git } from '../src/evidence/git';

/*
 * The review's two ways past the filter overrides of safeGit.ts, both reproduced on git 2.54 through git():
 * F1, a filter driver whose name holds `=` (`-c filter.x=y.clean=` sets `filter.x`, not the driver); F2, a
 * submodule, whose own repo-local config (.git/modules/<sub>/config) the superproject's overrides never saw.
 */
const posix = process.platform !== 'win32';

function scratch() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-gittrap-')));
  const marker = path.join(dir, 'ran');
  const trap = path.join(dir, 'trap.sh');
  writeFileSync(trap, `#!/bin/sh\necho "$0 $*" >> "${marker}"\ncat\n`);
  chmodSync(trap, 0o755);
  return { dir, marker, trap };
}

const sh = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'protocol.file.allow=always', ...args],
    {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

function repo(at: string) {
  sh(at, 'init', '-q');
  writeFileSync(path.join(at, 'a.txt'), 'a\n');
  sh(at, 'add', '.');
  sh(at, 'commit', '-qm', 'init');
}

const ran = (marker: string) => (existsSync(marker) ? readFileSync(marker, 'utf8') : '');

test('F1: a filter driver named with "=" is emptied like any other', { skip: !posix }, async () => {
  const { dir, marker, trap } = scratch();
  const r = path.join(dir, 'r');
  execFileSync('mkdir', [r]);
  repo(r);
  sh(r, 'config', 'filter.x=y.clean', trap);
  sh(r, 'config', 'filter.x=y.smudge', trap);
  writeFileSync(path.join(r, '.gitattributes'), 'a.txt filter=x=y\n');
  writeFileSync(path.join(r, 'a.txt'), 'a\nb\n');
  for (const args of [
    ['diff', '--name-only', 'HEAD'],
    ['status', '--porcelain'],
    ['diff', 'HEAD'],
  ])
    await git(r, args);
  assert.equal(ran(marker), '');
});

test('F2: a submodule’s own filters never run from the superproject', { skip: !posix }, async () => {
  const { dir, marker, trap } = scratch();
  const sub = path.join(dir, 'sub-origin');
  const top = path.join(dir, 'top');
  execFileSync('mkdir', [sub, top]);
  repo(sub);
  writeFileSync(path.join(sub, '.gitattributes'), '*.txt filter=s\n');
  sh(sub, 'add', '.');
  sh(sub, 'commit', '-qm', 'attrs');
  repo(top);
  sh(top, 'submodule', 'add', '-q', sub, 'sub');
  sh(top, 'commit', '-qm', 'sub');
  // What an agent working in the checkout can write: the submodule's own config.
  sh(path.join(top, 'sub'), 'config', 'filter.s.clean', trap);
  // Same size, new mtime: git can only tell by running the clean filter over it.
  writeFileSync(path.join(top, 'sub', 'a.txt'), 'b\n');
  const later = new Date(Date.now() + 5_000);
  utimesSync(path.join(top, 'sub', 'a.txt'), later, later);
  for (const args of [
    ['status', '--porcelain'],
    ['diff', 'HEAD'],
    ['diff', '--name-only', 'HEAD'],
    ['ls-files', '-z'],
  ])
    await git(top, args);
  assert.equal(ran(marker), '');
});

test('the filter listing failing is a refusal, never "no filters"', { skip: !posix }, async () => {
  const { dir } = scratch();
  const r = path.join(dir, 'r');
  execFileSync('mkdir', [r]);
  repo(r);
  // A config git can't read: the listing exits 128, and git must not then run with no overrides.
  writeFileSync(path.join(r, '.git', 'config'), '[core\n\tbroken');
  const res = await git(r, ['status', '--porcelain']);
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /couldn't read this repository's git config/);
});
