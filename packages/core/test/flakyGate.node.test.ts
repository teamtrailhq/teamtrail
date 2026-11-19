import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { baselineForClaim } from '../src/evidence/baseline';
import { FLAKY_REWORK } from '../src/flaky/flakyRework';
import { readFlakyChecks } from '../src/flaky/readFlakyChecks';
import { journalFile } from '../src/history/journalFile';
import type { GateMode } from '../src/model/gateMode';
import { derivePhases } from '../src/planning/lifecycle/phase';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { proofForTicket } from '../src/proof/proofForTicket';
import { proofMarkdown } from '../src/proof/proofMarkdown';
import { approvalItems } from '../src/verification/approvals';
import { readAttempts } from '../src/verification/evidenceStore';
import { operatorAction } from '../src/verification/operatorActions';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

/**
 * A git repo with one execute ticket whose check passes only while a flag file outside the repo exists: flipping the
 * flag is a flaky test, since the code doesn't change.
 */
async function setup(flaky?: GateMode) {
  const repo = tempFolder('teamtrail-flaky-');
  const flag = path.join(tempFolder('teamtrail-flag-'), 'pass');
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  const check = `const ok = require('fs').existsSync(${JSON.stringify(flag)}); if (!ok) console.log('not ok 1 - keeps the session'); process.exit(ok ? 0 : 1)`;
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      checks: { test: { run: [process.execPath, '-e', check] } },
      run: ['test'],
      ...(flaky ? { gates: { flaky } } : {}),
    }),
  );
  approveAllHere(root);
  writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...a], { cwd: repo });
  git('init', '-q');
  git('add', 'a.txt');
  git('commit', '-qm', 'init');
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Flaky',
    sections: SECTIONS,
    verification: 'checks',
    tickets: [{ ref: 'a', title: 'A', type: 'execute', body: '' }],
  });
  const env = { adapter, root, journal: journalFile(root) };
  const id = tickets[0].id;
  const agent = { actor: 'Scout-1', actorKind: 'agent' as const };
  const complete = async () => {
    await transition(adapter, map.id, id, { ...agent, event: 'claim' });
    const claim = { root, cwd: repo, mapId: map.id, ticket: tickets[0], agent: 'Scout-1', resume: true };
    await baselineForClaim(claim);
    await transition(adapter, map.id, id, { ...agent, event: 'submit' });
    const snap = await adapter.loadMap(map.id);
    const t = snap.tickets[0];
    const info = levelFor(root, snap, t).info;
    await (
      await verify(env, { mapId: map.id, ticket: t, info, sub: { agent: 'Scout-1', resolution: 'did A' } })
    ).done;
  };
  const phase = async () => derivePhases((await adapter.loadMap(map.id)).tickets).get(id);
  const proof = async () => {
    const snap = await adapter.loadMap(map.id);
    return proofForTicket({ root, snap, ticket: snap.tickets[0], decisions: [] });
  };
  return { repo, root, adapter, env, mapId: map.id, id, flag, git, complete, phase, proof };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Fails, then passes on the same code: the flag file appears, nothing in the repo changes. */
async function failThenPass(s: Setup) {
  await s.complete();
  assert.equal(await s.phase(), 'rework');
  writeFileSync(s.flag, '');
  await s.complete();
}

const cleanup = (s: Setup) => {
  rmSync(s.repo, { recursive: true, force: true });
  rmSync(path.dirname(s.flag), { recursive: true, force: true });
};

test('enforce: a pass on retry with no change waits for the trail lead, who can accept it', async () => {
  const s = await setup();
  await failThenPass(s);
  assert.equal(await s.phase(), 'blocked');
  const a2 = readAttempts(s.root, s.mapId, s.id).at(-1)!;
  assert.equal(a2.result, 'pass');
  assert.equal(a2.flaky?.mode, 'enforce');
  assert.deepEqual(
    a2.flaky?.checks.map((c) => [c.name, c.failedIn, c.failure, c.test]),
    [['test', 'A-1', 'exited 1', 'keeps the session']],
  );
  const gates = journalFile(s.root).readGates(s.mapId);
  assert.deepEqual(
    gates.map((g) => [g.gate, g.mode]),
    [['flaky', 'enforce']],
  );
  assert.match(
    gates[0].reason,
    /^test \(keeps the session\) failed in A-1, then passed on [0-9a-f]{7} with no change$/,
  );
  const held = approvalItems(s.root, await s.adapter.loadMap(s.mapId));
  assert.match(held[0].reason, /^Passed only on retry: test/);
  let proof = await s.proof();
  assert.equal(proof.status, 'not-verified');
  assert.match(proof.gaps.join('\n'), /the trail lead hasn't accepted the pass/);

  await operatorAction(s.env, {
    action: 'accept',
    mapId: s.mapId,
    ticketId: s.id,
    by: 'trail lead',
    reason: 'known CI timing',
  });
  assert.equal(await s.phase(), 'done');
  const accepted = journalFile(s.root).read(s.mapId).at(-1)!;
  assert.equal(accepted.event, 'accept');
  assert.match(accepted.reason ?? '', /^accepted the pass on retry of test: known CI timing/);
  proof = await s.proof();
  assert.equal(proof.status, 'verified');
  assert.equal(proof.retried?.[0].accepted, true);
  assert.match(proofMarkdown(proof), /passed on retry: it failed in A\\-1 .* the trail lead accepted the pass/);
  cleanup(s);
});

test('enforce: rework tells the agent to find the root cause; a re-run is held again', async () => {
  const s = await setup('enforce');
  await failThenPass(s);
  const base = { mapId: s.mapId, ticketId: s.id, by: 'trail lead' };
  const rerun = await operatorAction(s.env, { ...base, action: 'rerun' });
  assert.equal(rerun.attemptId, 'A-3');
  for (let i = 0; i < 100 && readAttempts(s.root, s.mapId, s.id).length < 3; i++)
    await new Promise((x) => setTimeout(x, 50));
  for (let i = 0; i < 100 && (await s.phase()) !== 'blocked'; i++) await new Promise((x) => setTimeout(x, 50));
  assert.equal(await s.phase(), 'blocked');
  assert.equal(readAttempts(s.root, s.mapId, s.id).at(-1)?.flaky?.mode, 'enforce');

  await operatorAction(s.env, { ...base, action: 'rework', reason: 'fix the session race' });
  assert.equal(await s.phase(), 'rework');
  const t = (await s.adapter.loadMap(s.mapId)).tickets[0];
  assert.ok(t.comments.at(-1)!.body.includes(FLAKY_REWORK));
  cleanup(s);
});

test('observe: the pass counts, flagged in the journal and the proof', async () => {
  const s = await setup('observe');
  await failThenPass(s);
  assert.equal(await s.phase(), 'done');
  assert.equal(readAttempts(s.root, s.mapId, s.id).at(-1)?.flaky?.mode, 'observe');
  assert.deepEqual(
    journalFile(s.root)
      .readGates(s.mapId)
      .map((g) => g.mode),
    ['observe'],
  );
  const proof = await s.proof();
  assert.equal(proof.status, 'verified');
  assert.match(proofMarkdown(proof), /passed on retry.*flagged, not held/);
  cleanup(s);
});

test('off: nothing is flagged or journaled', async () => {
  const s = await setup('off');
  await failThenPass(s);
  assert.equal(await s.phase(), 'done');
  assert.equal(readAttempts(s.root, s.mapId, s.id).at(-1)?.flaky, undefined);
  assert.deepEqual(journalFile(s.root).readGates(s.mapId), []);
  cleanup(s);
});

test('a pass after the code changed is a fix, not a retry', async () => {
  const s = await setup();
  await s.complete();
  writeFileSync(s.flag, '');
  writeFileSync(path.join(s.repo, 'a.txt'), 'fixed\n');
  await s.complete();
  assert.equal(await s.phase(), 'done');
  assert.equal(readAttempts(s.root, s.mapId, s.id).at(-1)?.flaky, undefined);
  cleanup(s);
});

test('the project list counts each check that flipped on unchanged code', async () => {
  const s = await setup('observe');
  await failThenPass(s);
  const view = await readFlakyChecks(s.root, s.adapter);
  assert.equal(view.mode, 'observe');
  assert.deepEqual(
    view.rows.map((r) => [r.name, r.test, r.count, r.tickets.length]),
    [['test', 'keeps the session', 1, 1]],
  );
  cleanup(s);
});
