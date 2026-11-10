import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { CheckSpec } from '../src/model/verification';
import { parseVerificationConfig } from '../src/verification/config';
import { checkPassed, MAX_LOG_BYTES, runCheck, type CheckRun } from '../src/verification/runCheck';
import { runChecks } from '../src/verification/runChecks';

const node = (code: string, timeoutSec = 30): CheckSpec => ({ run: [process.execPath, '-e', code], timeoutSec });

function setup(): CheckRun & { tracker: string } {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-checks-'));
  const tracker = path.join(repoRoot, '.teamtrail');
  return { repoRoot, tracker, logDir: path.join(tracker, 'logs'), logRel: 'logs' };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('a check passes on exit 0 and fails on any other exit, with its output logged', async () => {
  const run = setup();
  const ok = await runCheck('lint', node('console.log("all good")'), run);
  assert.ok(checkPassed(ok));
  assert.equal(ok.exitCode, 0);
  assert.equal(ok.tail, 'all good');
  assert.equal(ok.log, 'logs/lint.log');
  assert.match(readFileSync(path.join(run.logDir, 'lint.log'), 'utf8'), /all good/);

  const bad = await runCheck('test', node('console.error("2 failing"); process.exit(3)'), run);
  assert.equal(checkPassed(bad), false);
  assert.equal(bad.exitCode, 3);
  assert.equal(bad.error, undefined);
  assert.match(bad.tail, /2 failing/);
});

test('argv is passed as is, without a shell', async () => {
  const run = setup();
  const r = await runCheck(
    'argv',
    { run: [process.execPath, '-e', 'console.log(process.argv[1])', '$(echo hi); rm -rf /'], timeoutSec: 30 },
    run,
  );
  assert.equal(r.tail, '$(echo hi); rm -rf /');
});

test(
  'a timeout kills the whole process tree, grandchildren included',
  { skip: process.platform === 'win32' },
  async () => {
    const run = setup();
    const marker = path.join(run.repoRoot, 'grandchild-survived');
    const pidFile = path.join(run.repoRoot, 'grandchild.pid');
    const grandchild = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 1500)`;
    const code = `
    const c = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'inherit' });
    require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
  `;
    const started = Date.now();
    const r = await runCheck('hang', node(code), { ...run, timeoutMs: 300, killGraceMs: 200 });
    assert.equal(r.timedOut, true);
    assert.equal(checkPassed(r), false);
    assert.ok(Date.now() - started < 5000, 'the SIGTERM-ignoring check was killed after the grace period');
    assert.match(r.tail, /timed out/);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    await new Promise((r) => setTimeout(r, 1800));
    assert.equal(alive(pid), false);
    assert.equal(existsSync(marker), false);
  },
);

test('a backgrounded child is killed when the check exits', { skip: process.platform === 'win32' }, async () => {
  const run = setup();
  const pidFile = path.join(run.repoRoot, 'bg.pid');
  const code = `
    const c = require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    c.unref();
    require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));
  `;
  const r = await runCheck('bg', node(code), run);
  assert.ok(checkPassed(r));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(alive(Number(readFileSync(pidFile, 'utf8'))), false);
});

test('output over the cap is cut with a marker, the tail stays the latest output', async () => {
  const run = setup();
  const code = `const line = 'x'.repeat(1023) + '\\n'; for (let i = 0; i < 1500; i++) process.stdout.write(line); console.log('END')`;
  const r = await runCheck('big', node(code), run);
  assert.ok(checkPassed(r));
  assert.equal(r.truncated, true);
  const log = readFileSync(path.join(run.logDir, 'big.log'), 'utf8');
  assert.ok(log.length < MAX_LOG_BYTES + 200);
  assert.match(log, /\[truncated: output over/);
  assert.match(r.tail, /END$/);
  assert.ok(r.tail.length <= 4096);
});

test('cwd must stay inside the repo, symlinks resolved', async () => {
  const run = setup();
  mkdirSync(path.join(run.repoRoot, 'pkg'));
  const inside = await runCheck('in', { ...node('console.log(process.cwd())'), cwd: 'pkg' }, run);
  assert.ok(checkPassed(inside));
  assert.equal(inside.cwd, 'pkg');
  const up = await runCheck('up', { ...node('1'), cwd: '..' }, run);
  assert.match(up.error ?? '', /not a directory inside the repo/);
  assert.equal(checkPassed(up), false);
  symlinkSync(os.tmpdir(), path.join(run.repoRoot, 'escape'));
  const link = await runCheck('link', { ...node('1'), cwd: 'escape' }, run);
  assert.match(link.error ?? '', /inside the repo/);
});

test('tokens are not passed to checks, and token-shaped output is redacted', async () => {
  const run = setup();
  const token = `ghp_${'a'.repeat(36)}`;
  const env = {
    ...process.env,
    GITHUB_TOKEN: token,
    LINEAR_API_KEY: 'k',
    TEAMTRAIL_SECRET: 's',
    PLAIN: 'kept',
    TEAMTRAIL_CHECK_ENV: 'PLAIN',
  };
  const r = await runCheck(
    'env',
    node(
      `console.log([process.env.GITHUB_TOKEN, process.env.LINEAR_API_KEY, process.env.TEAMTRAIL_SECRET, process.env.PLAIN].join('|'))`,
    ),
    { ...run, env },
  );
  assert.equal(r.tail, '|||kept');
  const leak = await runCheck('leak', node(`console.log('token ${token} here')`), run);
  assert.equal(leak.tail, 'token [redacted] here');
  assert.doesNotMatch(readFileSync(path.join(run.logDir, 'leak.log'), 'utf8'), /ghp_/);
});

test('a missing binary is an error, not a failure', async () => {
  const run = setup();
  const r = await runCheck('ghost', { run: ['teamtrail-no-such-binary'], timeoutSec: 5 }, run);
  assert.equal(r.exitCode, null);
  assert.match(r.error ?? '', /ENOENT/);
});

test('runChecks runs in order, stops at the first failure, and reports config problems as errors', async () => {
  const run = setup();
  const { config } = parseVerificationConfig(
    JSON.stringify({
      v: 1,
      checks: {
        a: { run: [process.execPath, '-e', 'console.log("a")'] },
        b: { run: [process.execPath, '-e', 'process.exit(1)'] },
        c: { run: [process.execPath, '-e', 'console.log("c")'] },
        ghost: { run: ['teamtrail-no-such-binary'] },
      },
      run: ['a', 'b', 'c'],
    }),
  );
  assert.ok(config);
  const failed = await runChecks(config, config.run, run);
  assert.equal(failed.result, 'fail');
  assert.deepEqual(
    failed.checks.map((c) => c.name),
    ['a', 'b'],
  );
  const all = await runChecks({ ...config, failFast: false }, config.run, run);
  assert.deepEqual(
    all.checks.map((c) => c.name),
    ['a', 'b', 'c'],
  );
  assert.equal((await runChecks(config, ['a', 'c'], run)).result, 'pass');
  assert.equal((await runChecks(config, [], run)).result, 'pass');
  const unknown = await runChecks(config, ['a', 'nope'], run);
  assert.equal(unknown.result, 'error');
  assert.equal(unknown.checks.length, 0);
  assert.match(unknown.note ?? '', /unknown check nope/);
  const broken = await runChecks(config, ['ghost'], run);
  assert.equal(broken.result, 'error');
});

test('the total budget caps every check and skips the rest', async () => {
  const run = setup();
  const { config } = parseVerificationConfig(
    JSON.stringify({
      v: 1,
      totalTimeoutSec: 1,
      failFast: false,
      checks: {
        slow: { run: [process.execPath, '-e', 'setTimeout(() => {}, 10000)'], timeoutSec: 600 },
        next: { run: [process.execPath, '-e', '1'] },
      },
      run: ['slow', 'next'],
    }),
  );
  assert.ok(config);
  const r = await runChecks(config, config.run, run);
  assert.equal(r.result, 'fail');
  assert.equal(r.checks[0].timedOut, true);
  assert.equal(r.checks.length, 1);
  assert.match(r.note ?? '', /total timeout/);
});
