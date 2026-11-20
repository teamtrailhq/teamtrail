import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { CheckSpec } from '../src/model/verification';
import { checkEnv } from '../src/verification/checkEnv';
import { checksApproval } from '../src/verification/checksApproval';
import { runCheck } from '../src/verification/runCheck';
import { setChecks } from '../src/verification/setChecks';
import { toolPathRefusal } from '../src/verification/toolPathRefusal';
import { tempFolder } from './tempFolder';

const posix = process.platform !== 'win32';

/** A repo with a program in `rel` that prints `said`, and a folder outside it. */
function repoWith(rel: string, said: string) {
  const top = realpathSync(tempFolder('teamtrail-identity-'));
  const repo = path.join(top, 'repo');
  const outside = path.join(top, 'outside');
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  mkdirSync(outside, { recursive: true });
  const program = path.join(outside, 'planted');
  writeFileSync(program, `#!/bin/sh\necho ${said}\n`);
  chmodSync(program, 0o755);
  return { repo, outside, program };
}

const run = (repo: string) => ({ repoRoot: repo, logDir: path.join(repo, '.logs'), logRel: '.logs' });
const spec = (argv: string[], cwd?: string): CheckSpec => ({ run: argv, timeoutSec: 30, ...(cwd ? { cwd } : {}) });

test('a tool-folder program that links out of the repo never runs as the known tool', { skip: !posix }, async () => {
  const { repo, program } = repoWith('node_modules/.bin/jest', 'planted');
  symlinkSync(program, path.join(repo, 'node_modules/.bin/jest'));
  const result = await runCheck('test', spec(['node_modules/.bin/jest']), run(repo));
  assert.equal(result.exitCode, null);
  assert.match(result.error ?? '', /node_modules\/\.bin\/jest leads outside the repo/);
  assert.doesNotMatch(result.tail, /^planted$/m, 'the planted program never ran');
});

test('a tool folder that is itself a link out of the repo is refused too', { skip: !posix }, async () => {
  const { repo, outside, program } = repoWith('x', 'planted');
  mkdirSync(path.join(outside, 'bin'));
  symlinkSync(program, path.join(outside, 'bin', 'pytest'));
  symlinkSync(outside, path.join(repo, '.venv'));
  assert.match(toolPathRefusal({ argv0: '.venv/bin/pytest', root: repo, cwd: repo }) ?? '', /leads outside the repo/);
});

test('links that stay in the repo run, and a virtualenv’s interpreter may link to its Python', { skip: !posix }, () => {
  const { repo, program } = repoWith('node_modules/jest/bin/jest.js', 'x');
  writeFileSync(path.join(repo, 'node_modules/jest/bin/jest.js'), '');
  mkdirSync(path.join(repo, 'node_modules/.bin'));
  symlinkSync('../jest/bin/jest.js', path.join(repo, 'node_modules/.bin/jest'));
  assert.equal(toolPathRefusal({ argv0: 'node_modules/.bin/jest', root: repo, cwd: repo }), undefined);
  mkdirSync(path.join(repo, 'apps/web'), { recursive: true });
  const web = path.join(repo, 'apps/web');
  assert.equal(toolPathRefusal({ argv0: '../../node_modules/.bin/jest', root: repo, cwd: web }), undefined);
  mkdirSync(path.join(repo, '.venv/bin'), { recursive: true });
  symlinkSync(program, path.join(repo, '.venv/bin/python3'));
  assert.equal(toolPathRefusal({ argv0: '.venv/bin/python3', root: repo, cwd: repo }), undefined);
  symlinkSync(program, path.join(repo, '.venv/bin/pytest'));
  assert.match(toolPathRefusal({ argv0: '.venv/bin/pytest', root: repo, cwd: repo }) ?? '', /leads outside/);
  // a bare name and any other path aren't the tool folders' to judge: their identity is settled at approval
  assert.equal(toolPathRefusal({ argv0: 'jest', root: repo, cwd: repo }), undefined);
  assert.equal(toolPathRefusal({ argv0: program, root: repo, cwd: repo }), undefined);
});

test("a check's PATH holds absolute folders only, so a bare name never finds a file in the repo", () => {
  const sep = path.delimiter;
  const abs = path.resolve('/usr/bin');
  const { env } = checkEnv({ PATH: ['', '.', 'node_modules/.bin', abs, './bin'].join(sep) });
  assert.equal(env.PATH, abs);
});

test('a check is judged known in the folder it runs in, the kept one included', () => {
  const root = path.join(tempFolder('teamtrail-identity-set-'), '.teamtrail');
  mkdirSync(root, { recursive: true });
  const jest = ['../../node_modules/.bin/jest'];
  setChecks({ root, base: 'none', by: 'Ada', checks: [{ name: 'web', run: jest, cwd: 'apps/web' }] });
  // the same argv kept under its name keeps its folder, so it's still the repo's jest
  setChecks({ root, base: checksApproval(root).hash, by: 'Ada', checks: [{ name: 'web', run: [...jest, '--ci'] }] });
  assert.throws(
    () => setChecks({ root, base: checksApproval(root).hash, by: 'Ada', checks: [{ name: 'top', run: jest }] }),
    /unknown program/,
    'from the top, ../../node_modules leaves the repo',
  );
  assert.throws(
    () =>
      setChecks({ root, base: checksApproval(root).hash, by: 'Ada', checks: [{ name: 't', run: ['/tmp/x/pytest'] }] }),
    /unknown program/,
  );
});
