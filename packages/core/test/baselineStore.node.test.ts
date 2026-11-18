import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { localGuard } from '../src/checkGuard/localGuard';
import { captureBaseline, latestBaseline } from '../src/evidence/baseline';
import { collectEvidence } from '../src/evidence/collectEvidence';
import { machineStore } from '../src/machine/machineStore';
import type { GitEvidence } from '../src/model/evidence';
import type { MapSnapshot, Ticket } from '../src/model/types';
import { DEFAULT_CONFIG, parseVerificationConfig } from '../src/verification/config';

const sh = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });

/** A repo with one commit whose `npm test` runs `scripts.test`, and its tracker folder. */
function repo() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-baseline-')));
  sh(dir, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node test.js' } }));
  writeFileSync(path.join(dir, 'test.js'), 'process.exit(0)\n');
  sh(dir, 'add', '.');
  sh(dir, 'commit', '-qm', 'init');
  const root = path.join(dir, '.teamtrail');
  mkdirSync(root);
  return { dir, root };
}

const ticket = { id: '3', key: '#3', type: 'execute' } as Ticket;
const claim = (r: { dir: string; root: string }) =>
  captureBaseline({ root: r.root, cwd: r.dir, mapId: 'm', ticket, agent: 'claude-01' });
const snap = { map: { id: 'm' }, tickets: [] } as unknown as MapSnapshot;
const config = parseVerificationConfig(JSON.stringify({ v: 1, checks: { test: { run: ['npm', 'test'] } } })).config;
const evidence = (r: { dir: string; root: string }) =>
  collectEvidence({ root: r.root, cwd: r.dir, snap, ticket, config: DEFAULT_CONFIG });
const guardOf = (r: { dir: string }, git: GitEvidence, cfg = config) =>
  localGuard({ config: cfg, checks: ['test'], git, checkout: r.dir });
const storeFile = (root: string) => {
  const dir = path.join(machineStore(root).dir, 'baselines', 'm--3');
  return path.join(
    dir,
    readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .sort()
      .at(-1)!,
  );
};

test("a claim's baseline is kept signed in this machine's store, never in the repo", async () => {
  const r = repo();
  const b = await claim(r);
  assert.equal(b.id, 'baseline-1');
  assert.equal(existsSync(path.join(r.root, '.evidence')), false, 'nothing of it in the tracker folder');
  assert.equal(latestBaseline(r.root, 'm', '3')?.git?.head, b.git?.head);
  assert.equal((await claim(r)).id, 'baseline-2');
});

test('an edited, unsigned or repo-kept baseline counts as none, and the check guard holds the work as unread', async () => {
  const r = repo();
  const base = (await claim(r)).git!.head!;
  // the work changes what `npm test` runs, then commits, so a baseline moved to that commit would hide it
  writeFileSync(path.join(r.dir, 'package.json'), JSON.stringify({ scripts: { test: 'node -e 0' } }));
  sh(r.dir, 'commit', '-qam', 'work');
  const trusted = await evidence(r);
  assert.equal(trusted.base?.head, base);
  assert.equal((await guardOf(r, trusted))?.findings[0].kind, 'script');

  const file = storeFile(r.root);
  const moved = JSON.parse(readFileSync(file, 'utf8'));
  moved.baseline.git.head = sh(r.dir, 'rev-parse', 'HEAD').trim();
  writeFileSync(file, JSON.stringify(moved));
  assert.equal(latestBaseline(r.root, 'm', '3'), undefined, 'an edited record holds nothing');
  const forged = await evidence(r);
  assert.equal(forged.baseline, undefined);
  assert.ok(forged.flags.some((f) => f.kind === 'no-baseline'));
  const held = await guardOf(r, forged);
  assert.deepEqual(
    held && { mode: held.mode, kinds: held.findings.map((f) => f.kind) },
    { mode: 'enforce', kinds: ['unread'] },
    'never a pass: what it changed is unknown',
  );
  const off = parseVerificationConfig(
    JSON.stringify({ v: 1, checks: { test: { run: ['npm', 'test'] } }, gates: { 'check-guard': 'off' } }),
  ).config;
  assert.equal(await guardOf(r, forged, off), undefined, 'a guard switched off reads nothing');

  // a baseline in the repo, as earlier versions kept it, is never read
  const old = path.join(r.root, '.evidence', 'm', '3');
  mkdirSync(old, { recursive: true });
  writeFileSync(path.join(old, 'baseline-9.json'), JSON.stringify(moved.baseline));
  // nor one planted unsigned in the store
  writeFileSync(path.join(path.dirname(file), 'baseline-10.json'), JSON.stringify({ v: 1, baseline: moved.baseline }));
  assert.equal(latestBaseline(r.root, 'm', '3'), undefined);
});
