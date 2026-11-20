import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { createTrackerBridge } from '../src/bridge';
import { journalFile } from '../src/history/journalFile';
import type { RepoFiles } from '../src/model/checkScreening';
import { TRUST_JOURNAL } from '../src/model/lifecycle';
import type { RepoReadiness } from '../src/model/readiness';
import { applyReadinessFixes } from '../src/readiness/applyReadinessFixes';
import { findProgram } from '../src/readiness/findProgram';
import { probeLocal } from '../src/readiness/probeLocal';
import { programVersion } from '../src/readiness/programVersion';
import { readinessChoice } from '../src/readiness/readinessChoices';
import { readReadiness } from '../src/readiness/readReadiness';
import { serviceReachable } from '../src/readiness/serviceReachable';
import { startAnyway } from '../src/readiness/startAnyway';
import { detectRepoProfile } from '../src/repoProfile';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';
import { checksApproval, trustedChecks } from '../src/verification/checksApproval';
import { StaleChecks } from '../src/verification/setChecks';
import { memoryRepoFiles } from './fakes/memoryRepoFiles';
import { tempFolder } from './tempFolder';

const MONOREPO = {
  'package.json': JSON.stringify({ workspaces: ['apps/*'], scripts: { test: 'node --test' } }),
  'package-lock.json': '{}',
  'apps/web/package.json': JSON.stringify({ scripts: { test: 'ng test', lint: 'ng lint' } }),
};

function scratch(prefix: string) {
  const top = tempFolder(prefix);
  const root = path.join(top, 'repo', '.teamtrail');
  mkdirSync(root, { recursive: true });
  return { top, root };
}

/** A program `name` in `dir` that prints `out`. */
function program(dir: string, name: string, out: string) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, `#!/bin/sh\necho "${out}"\n`);
  chmodSync(file, 0o755);
  return file;
}

const files = (extra: Record<string, string> = {}): RepoFiles =>
  Object.assign(memoryRepoFiles({ ...MONOREPO, ...extra }), { seesInstalls: true });

test('programs are found on absolute PATH entries only, never run to be found', { skip: process.platform === 'win32' }, () => {
  const { top } = scratch('teamtrail-ready-path-');
  const bin = path.join(top, 'bin');
  const go = program(bin, 'go', 'go version go1.22.1 linux/amd64');
  assert.equal(findProgram('go', { PATH: `relative/bin${path.delimiter}${bin}` }), go);
  assert.equal(findProgram('go', { PATH: 'relative/bin' }), undefined);
  assert.equal(findProgram('./go', { PATH: bin }), undefined, 'a path is never looked up');
});

test('a version is read from a binary outside the repo only, never a shim', { skip: process.platform === 'win32' }, async () => {
  const { top } = scratch('teamtrail-ready-version-');
  const repoRoot = path.join(top, 'repo');
  const outside = program(path.join(top, 'bin'), 'node', 'v20.11.1');
  assert.equal(await programVersion({ file: outside, args: ['--version'], repoRoot, env: {} }), '20.11.1');
  const inside = program(path.join(repoRoot, 'bin'), 'node', 'v20.11.1');
  assert.equal(await programVersion({ file: inside, args: ['--version'], repoRoot, env: {} }), undefined);
  const shim = program(path.join(top, '.asdf', 'shims'), 'node', 'v20.11.1');
  assert.equal(await programVersion({ file: shim, args: ['--version'], repoRoot, env: {} }), undefined);
});

test('probes: programs, installs, a variable passed or not, never a value', { skip: process.platform === 'win32' }, async () => {
  const { top } = scratch('teamtrail-ready-probe-');
  const bin = path.join(top, 'bin');
  program(bin, 'npm', '10.0.0');
  const f = files({ '.env.example': 'DATABASE_URL=\nLOG_LEVEL=info\n' });
  const profile = await detectRepoProfile(f);
  const config = { checks: { test: { run: ['npm', 'test'] }, api: { run: ['go', 'test'] } } } as never;
  const source = { PATH: bin, DATABASE_URL: 'postgres://secret', TEAMTRAIL_CHECK_ENV: 'LOG_LEVEL', LOG_LEVEL: 'x' };
  const probes = await probeLocal({ repoRoot: path.join(top, 'repo'), files: f, profile, config, source });
  assert.deepEqual(probes.programs, { go: {}, npm: { path: path.join(bin, 'npm') } });
  assert.deepEqual(probes.installed, { '': false });
  assert.deepEqual(probes.variables, { passed: ['LOG_LEVEL'], withheld: ['DATABASE_URL'] });
  assert.ok(!JSON.stringify(probes).includes('secret'));
});

test('services: a TCP connect on 127.0.0.1, Docker by its socket or DOCKER_HOST, unknown ones unsaid', async () => {
  assert.equal(await serviceReachable('docker', { DOCKER_HOST: 'tcp://127.0.0.1:2375' }), true);
  assert.equal(await serviceReachable('something-else', {}), undefined);
  const server = http.createServer();
  const listening = await new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(5432, '127.0.0.1', () => resolve(true));
  });
  try {
    // either our server or a Postgres already running here answers
    assert.equal(await serviceReachable('postgres', {}), true);
  } finally {
    if (listening) server.close();
  }
});

test('no checkout: nothing is read or held', async () => {
  const { root } = scratch('teamtrail-ready-none-');
  const r = await readReadiness({ root, probe: true });
  assert.equal(r.read, false);
  assert.deepEqual(r.findings, []);
});

test('fixes: suggested checks and a setup step, exactly as shown, approved in one step and journaled', async () => {
  const { root } = scratch('teamtrail-ready-fix-');
  const f = files();
  let r = await readReadiness({ root, files: f, probe: true, fresh: true });
  const none = r.findings.find((x) => x.id === 'checks-none')!;
  assert.equal(none.level, 'blocks');
  const stale = applyReadinessFixes({ root, readiness: r, fixes: [{ id: none.id, hash: 'sha256:other' }], base: r.base, files: f, by: 'Ada' });
  await assert.rejects(stale, StaleChecks, 'a fix not as shown is refused');
  await applyReadinessFixes({ root, readiness: r, fixes: [{ id: none.id, hash: none.fixHash! }], base: r.base, files: f, by: 'Ada' });
  assert.equal(checksApproval(root).state, 'approved');
  const config = trustedChecks(root).config.config!;
  assert.deepEqual(config.run, ['test', 'web-test', 'web-lint']);
  assert.deepEqual(config.checks['web-test'], { run: ['npm', 'test'], cwd: 'apps/web', timeoutSec: 600 });
  assert.match(journalFile(root).readTrust(TRUST_JOURNAL).at(-1)!.subject, /repo readiness, in the Lookout: added the check test/);

  r = await readReadiness({ root, files: f, probe: true });
  assert.equal(r.blocking, 0, 'the hold lifts: a new approval reads again at once');
  const install = r.findings.find((x) => x.id === 'install:')!;
  assert.deepEqual(install.fix, { kind: 'add-setup', name: 'deps', run: ['npm', 'ci'], cwd: '' });
  await assert.rejects(
    applyReadinessFixes({ root, readiness: r, fixes: [{ id: install.id, hash: install.fixHash! }], base: 'none', files: f, by: 'Ada' }),
    StaleChecks,
    'only over the file as the page loaded it',
  );
  await applyReadinessFixes({ root, readiness: r, fixes: [{ id: install.id, hash: install.fixHash! }], base: r.base, files: f, by: 'Ada' });
  assert.deepEqual(trustedChecks(root).config.config!.setup, { deps: { run: ['npm', 'ci'], timeoutSec: 900 } });
  r = await readReadiness({ root, files: f, probe: true });
  assert.equal(r.findings.find((x) => x.id === 'install:')?.level, 'info');
});

test("fixes wait while verification.json has a change nobody approved here, so they never approve it unseen", async () => {
  const { root } = scratch('teamtrail-ready-waiting-');
  const file = path.join(root, 'verification.json');
  writeFileSync(file, JSON.stringify({ v: 1, checks: { t: { run: ['npm', 'test'] } }, run: ['t'], setup: { x: { run: ['npm', 'ci'] } } }));
  const r = await readReadiness({ root, files: files(), probe: false, fresh: true });
  assert.ok(r.findings.some((x) => x.id === 'checks-unapproved'));
  await assert.rejects(
    applyReadinessFixes({ root, readiness: r, fixes: [{ id: 'x', hash: 'y' }], base: r.base, files: files(), by: 'Ada' }),
    /waiting for your approval/,
  );
  assert.match(readFileSync(file, 'utf8'), /"x"/, 'untouched');
});

test('Start anyway: past what blocks now, on this machine, journaled with its undo; old journals still read', async () => {
  const { root } = scratch('teamtrail-ready-start-');
  const old = JSON.stringify({ v: 1, at: 1, mapId: 'm1', ticketId: 't1', from: 'open', to: 'claimed', actor: 'a' });
  mkdirSync(path.join(root, '.events'), { recursive: true });
  appendFileSync(path.join(root, '.events', 'm1.jsonl'), `${old}\n{"v":1,"kind":"from-the-future","mapId":"m1"}\n`);
  const r = (await readReadiness({ root, files: files(), probe: false, fresh: true })) as RepoReadiness;
  const choice = startAnyway({ root, mapId: 'm1', readiness: r, by: 'Ada' });
  assert.deepEqual(choice?.findings, ['checks-none']);
  assert.deepEqual(readinessChoice(root, 'm1')?.findings, ['checks-none']);
  startAnyway({ root, mapId: 'm1', readiness: r, by: 'Ada', undo: true });
  assert.equal(readinessChoice(root, 'm1'), undefined);
  const journal = journalFile(root);
  assert.deepEqual(journal.readReadinessChoices('m1').map((e) => e.action), ['start-anyway', 'undo-start-anyway']);
  assert.equal(journal.read('m1').length, 1, 'transitions read as before');
  const clean = { ...r, findings: [], blocking: 0 };
  assert.throws(() => startAnyway({ root, mapId: 'm1', readiness: clean, by: 'Ada' }), /Nothing about this repo holds work/);
});

test('routes: GET readiness; its fix and Start anyway answer this machine only', async () => {
  assert.equal(thisMachineOnly('POST', '/repo/readiness/fix'), true);
  assert.equal(thisMachineOnly('POST', '/repo/readiness/start-anyway'), true);
  assert.equal(thisMachineOnly('GET', '/repo/readiness'), false);
  const { root } = scratch('teamtrail-ready-route-');
  const f = files();
  const bridge = createTrackerBridge(root, { env: {}, configDir: path.join(root, 'cfg'), leases: { reapMs: 60_000 }, repoFiles: () => f });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const got = (await (await fetch(`${base}/repo/readiness?fresh=1`)).json()) as { readiness: RepoReadiness };
    const none = got.readiness.findings.find((x) => x.id === 'checks-none')!;
    const post = (p: string, body: unknown) =>
      fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await post('/repo/readiness/fix', { fixes: [{ id: none.id, hash: none.fixHash }], base: got.readiness.base });
    assert.equal(res.status, 200);
    const after = (await res.json()) as { readiness: RepoReadiness };
    assert.equal(after.readiness.blocking, 0);
    assert.equal((await post('/repo/readiness/start-anyway', { mapId: 'nope' })).status, 404);
  } finally {
    server.close();
    bridge.close();
  }
});
