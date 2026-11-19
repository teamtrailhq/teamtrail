import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { journalFile } from '../src/history/journalFile';
import { TRUST_JOURNAL } from '../src/model/lifecycle';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';
import { checksApproval, trustedChecks } from '../src/verification/checksApproval';
import { gateModeFor } from '../src/verification/gateModeFor';
import { readGateLog } from '../src/verification/readGateLog';
import { recordGate } from '../src/verification/recordGate';
import { setChecks, StaleChecks } from '../src/verification/setChecks';
import { setGateMode } from '../src/verification/setGateMode';
import { tempFolder } from './tempFolder';

/* How each verification gate acts, as the trail lead sets it in Settings → Verification → Gates. */
const tmpRoot = () => {
  const root = path.join(tempFolder('teamtrail-setgate-'), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const file = (root: string) => path.join(root, 'verification.json');
const withChecks = () => {
  const root = tmpRoot();
  setChecks({ root, base: 'none', by: 'Ada', checks: [{ name: 'test', run: ['npm', 'test'] }] });
  return root;
};
const set = (root: string, gate: unknown, mode: unknown) =>
  setGateMode({ root, gate, mode, base: checksApproval(root).hash, by: 'Ada' });

test('set and approved in one step, the other gates and the checks untouched, journaled', () => {
  const root = withChecks();
  set(root, 'flaky', 'observe');
  const approval = set(root, 'independent-review', 'enforce');
  assert.equal(approval.state, 'approved');
  const written = JSON.parse(readFileSync(file(root), 'utf8'));
  assert.deepEqual(written.gates, { flaky: 'observe', 'independent-review': 'enforce' });
  assert.deepEqual(written.checks, { test: { run: ['npm', 'test'] } });
  const config = trustedChecks(root).config.config;
  assert.equal(gateModeFor(config, 'independent-review'), 'enforce', 'what runs now');
  assert.equal(gateModeFor(config, 'check-guard'), 'enforce', 'a gate left out keeps its default');
  const entry = journalFile(root).readTrust(TRUST_JOURNAL).at(-1)!;
  assert.match(entry.subject, /verification gate independent-review: enforced/);
  assert.equal(entry.actor, 'Ada');
});

test('only over the file as it was loaded, and never approving commands nobody looked at', () => {
  const root = withChecks();
  assert.throws(() => setGateMode({ root, gate: 'flaky', mode: 'off', base: 'none', by: 'Ada' }), StaleChecks);
  const edited = { ...JSON.parse(readFileSync(file(root), 'utf8')), checks: { test: { run: ['npm', 'run', 'evil'] } } };
  writeFileSync(file(root), JSON.stringify(edited));
  assert.throws(() => set(root, 'flaky', 'off'), /Approve verification.json first/);
  assert.equal(checksApproval(root).waiting, true, 'the edited commands still wait');
});

test('needs the checks first, a known gate and one of off, observe or enforce', () => {
  assert.throws(() => setGateMode({ root: tmpRoot(), gate: 'flaky', mode: 'off', base: 'none', by: 'A' }), /checks/);
  const root = withChecks();
  assert.throws(() => set(root, 'everything', 'off'), /"gate"/);
  assert.throws(() => set(root, 'flaky', 'block'), /"mode"/);
});

test('only the machine Teamtrail runs on sets it; anyone signed in reads what the gates did', () => {
  assert.equal(thisMachineOnly('PUT', '/verification/gates'), true);
  assert.equal(thisMachineOnly('GET', '/verification/gates'), false);
});

test('the log: every trail, the last two weeks, newest first, unknown gates kept', () => {
  const root = tmpRoot();
  const now = Date.UTC(2026, 10, 18);
  const day = 24 * 60 * 60 * 1000;
  const ticket = { id: '3', key: 'T-3' };
  recordGate({ root, mapId: 'a', gate: 'flaky', mode: 'observe', reason: 'old', ticket, now: now - 20 * day });
  recordGate({ root, mapId: 'a', gate: 'flaky', mode: 'enforce', reason: 'held', ticket, now: now - day });
  recordGate({ root, mapId: 'b', gate: 'later-gate' as never, mode: 'observe', reason: 'new', now: now - 2 * day });
  recordGate({ root, mapId: 'c', gate: 'flaky', mode: 'off', reason: 'nothing', now });
  const log = readGateLog({ root, mapIds: ['a', 'b', 'c'], now });
  assert.equal(log.days, 14);
  assert.deepEqual(
    log.entries.map((e) => [e.mapId, e.gate, e.reason]),
    [
      ['a', 'flaky', 'held'],
      ['b', 'later-gate', 'new'],
    ],
  );
  assert.deepEqual(readGateLog({ root, mapIds: [], now }).entries, []);
});
