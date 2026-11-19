import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
// @ts-expect-error: a plain .mjs script, shared with the runners
import { runInTemp } from '../../../scripts/runInTemp.mjs';
// @ts-expect-error: a plain .mjs script, shared with the runners
import { testTemp } from '../../../scripts/testTemp.mjs';
import { tempFolder } from './tempFolder';

// Child mode: this same bundled file, re-run with TEMP_CHILD, makes a folder and a worktree folder next to it, says
// where, and fails.
if (process.env.RUN_CHILD) {
  // A runner (like `run.mjs serve`) whose command runs until it is stopped; says when it has started.
  const command = process.execPath;
  const args = ['-e', "process.stdout.write('up'); setInterval(() => {}, 1000)"];
  process.exit(await runInTemp({ label: 'unit', command, args, env: () => process.env, strict: false }));
} else if (process.env.TEMP_CHILD) {
  const dir = tempFolder('teamtrail-temp-child-');
  mkdirSync(`${dir}.teamtrail`);
  writeFileSync(path.join(dir, 'file'), 'x');
  process.stdout.write(dir);
  throw new Error('the test failed');
} else {
  test('a failed test file still removes its temp folders, and what was made next to them', () => {
    const r = spawnSync(process.execPath, [process.argv[1]], {
      env: { ...process.env, TEMP_CHILD: '1' },
      encoding: 'utf8',
    });
    assert.notEqual(r.status, 0);
    const dir = r.stdout.trim();
    assert.ok(dir, r.stderr);
    assert.equal(existsSync(dir), false);
    assert.equal(existsSync(`${dir}.teamtrail`), false);
  });

  test("a run's temp folder is removed at the end, and what its tests left is named", () => {
    const base = tempFolder('teamtrail-temp-base-');
    process.env.TEAMTRAIL_REAL_TMPDIR = base;
    try {
      const run = testTemp('unit');
      assert.equal(run.env.TMPDIR, run.dir);
      assert.equal(path.dirname(run.dir), base);
      mkdirSync(path.join(run.dir, 'config'));
      mkdirSync(path.join(run.dir, 'teamtrail-leaked-abc123'));
      mkdirSync(path.join(run.dir, 'node-compile-cache'));
      assert.deepEqual(run.finish({ expected: ['config'] }), ['teamtrail-leaked-abc123']);
      assert.deepEqual(readdirSync(base), []);
    } finally {
      delete process.env.TEAMTRAIL_REAL_TMPDIR;
    }
  });

  test("a run killed before it cleaned up is removed by the next run, a live run's folder never", () => {
    const base = tempFolder('teamtrail-temp-sweep-');
    const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    const dead = path.join(base, `teamtrail-run-${gone.stdout}-core-abc123`);
    const live = path.join(base, `teamtrail-run-${process.pid}-core-def456`);
    const other = path.join(base, 'teamtrail-run-notapid');
    for (const d of [dead, live, other]) mkdirSync(d);
    process.env.TEAMTRAIL_REAL_TMPDIR = base;
    try {
      testTemp('unit').finish();
    } finally {
      delete process.env.TEAMTRAIL_REAL_TMPDIR;
    }
    assert.equal(existsSync(dead), false);
    assert.equal(existsSync(live), true);
    assert.equal(existsSync(other), true);
  });

  test('a runner stopped by a signal with its process group still removes its run folder', async () => {
    const base = tempFolder('teamtrail-temp-signal-');
    const runner = spawn(process.execPath, [process.argv[1]], {
      env: { ...process.env, RUN_CHILD: '1', TEAMTRAIL_REAL_TMPDIR: base },
      detached: true,
    });
    const exited = new Promise((resolve) => runner.on('exit', resolve));
    await new Promise<void>((resolve) => runner.stdout!.on('data', () => resolve()));
    assert.equal(readdirSync(base).length, 1);
    process.kill(-runner.pid!, 'SIGTERM');
    await exited;
    assert.deepEqual(readdirSync(base), []);
  });
}
