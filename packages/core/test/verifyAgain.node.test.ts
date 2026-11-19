import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { numbered } from '../src/criteria/criteria';
import { criteriaHeld } from '../src/criteria/criteriaHeld';
import {
  confirmCriteriaHere,
  criteriaContent,
  readCriteriaFile,
  writeTicketCriteria,
} from '../src/criteria/criteriaStore';
import { baselineForClaim } from '../src/evidence/baseline';
import { journalFile } from '../src/history/journalFile';
import { derivePhases } from '../src/planning/lifecycle/phase';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { resolve } from '../src/planning/operations/resolve';
import { ticketGapPlan } from '../src/proof/ticketGapPlan';
import { checkAgainOnConfirm } from '../src/verification/checkAgainOnConfirm';
import { readAttempts } from '../src/verification/evidenceStore';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

/**
 * A git repo with one execute ticket at level `checks` whose criteria an agent wrote and nobody confirmed; the agent
 * claimed it, changed a file and submitted, with a passing check as evidence for its one criterion.
 */
async function setup() {
  const repo = tempFolder('teamtrail-again-');
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...a], { cwd: repo });
  writeFileSync(path.join(repo, 'README.md'), 'r');
  git('init', '-q');
  git('add', 'README.md');
  git('commit', '-qm', 'init');
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, default: 'checks', checks: { ok: { run: [process.execPath, '-e', '0'] } }, run: ['ok'] }),
  );
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Again',
    sections: SECTIONS,
    verification: 'checks',
    tickets: [{ ref: 'a', title: 'Export', type: 'execute', body: '' }],
  });
  const t0 = tickets[0];
  writeTicketCriteria(root, map, t0, { criteria: numbered([{ text: 'Exports rows', kind: 'unit' }]) });
  const env = { adapter, root, journal: journalFile(root) };
  const mapId = map.id;
  const id = t0.id;
  const agent = { actor: 'Scout-1', actorKind: 'agent' as const };
  const snap0 = await adapter.loadMap(mapId);
  const held = criteriaHeld(root, snap0).map((w) => `${w.stage} ${w.ticket.key}`);
  await transition(adapter, mapId, id, { ...agent, event: 'claim' });
  await baselineForClaim({ root, cwd: repo, mapId, ticket: t0, agent: 'Scout-1', resume: false });
  writeFileSync(path.join(repo, 'export.ts'), 'export {}');
  git('add', 'export.ts');
  git('commit', '-qm', 'export');
  await transition(adapter, mapId, id, { ...agent, event: 'submit' });
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets[0];
  const sub = { agent: 'Scout-1', resolution: 'Exports rows', criteria: [{ id: 'AC-1', evidence: 'check:ok' }] };
  await (
    await verify(env, { mapId, ticket: t, info: levelFor(root, snap, t).info, sub })
  ).done;
  const phase = async () => derivePhases((await adapter.loadMap(mapId)).tickets).get(id);
  const until = async (want: string) => {
    for (let i = 0; i < 200 && (await phase()) !== want; i++) await new Promise((x) => setTimeout(x, 25));
    return phase();
  };
  const confirm = () => {
    const saved = writeTicketCriteria(root, map, t0, { confirmed: true });
    const content = criteriaContent(readCriteriaFile(root, mapId).find((c) => c.ticketId === saved.ticketId)!);
    confirmCriteriaHere(root, { mapId, ticketId: id, content }, 'trail lead');
  };
  const plan = async () => {
    const s = await adapter.loadMap(mapId);
    const ticket = s.tickets[0];
    return ticketGapPlan({ root, snap: s, ticket, decisions: await adapter.listDecisions(mapId) });
  };
  return { repo, root, git, adapter, env, mapId, id, key: t0.key, held, phase, until, confirm, plan };
}

test('criteria written but not confirmed hold the ticket back from agents before the work starts', async () => {
  const s = await setup();
  assert.deepEqual(s.held, [`before-work ${s.key}`]);
});

test('a pass against unconfirmed criteria waits for the trail lead; confirming checks it again and it is verified', async () => {
  const s = await setup();
  // done means verified: the pass doesn't close on criteria nobody agreed to
  assert.equal(await s.phase(), 'verifying');
  const before = await s.plan();
  assert.equal(before.proof.status, 'not-verified');
  assert.deepEqual(
    before.plan.map((g) => [g.kind, g.owner, g.action]),
    [['criteria-unconfirmed', 'you', 'confirm-criteria']],
  );
  const snap = await s.adapter.loadMap(s.mapId);
  // the queue asks for the criteria, not for an approval of the work as it is
  assert.deepEqual(
    criteriaHeld(s.root, snap).map((w) => [w.stage, w.attemptId]),
    [['after-pass', 'A-1']],
  );

  s.confirm();
  const again = await checkAgainOnConfirm(s.env, { mapId: s.mapId, ticketId: s.id, by: 'trail lead' });
  assert.deepEqual(again, { attemptId: 'A-2' });
  assert.equal(await s.until('done'), 'done');
  const attempts = readAttempts(s.root, s.mapId, s.id);
  // a new attempt, graded against the confirmed criteria; the first stays as it was
  assert.deepEqual(
    attempts.map((a) => [a.id, a.result, a.criteria?.confirmed]),
    [
      ['A-1', 'pass', false],
      ['A-2', 'pass', true],
    ],
  );
  assert.equal(attempts[0].git?.tree?.head, attempts[1].git?.tree?.head);
  const after = await s.plan();
  assert.equal(after.proof.status, 'verified');
  assert.deepEqual(after.plan, []);
});

test('a done ticket closed on unconfirmed criteria is verified again on the same commit, replacing its decision', async () => {
  const s = await setup();
  // as earlier versions did: the pass closed it
  await resolve(s.adapter, s.mapId, s.id, {
    event: 'checks.pass',
    actor: 'teamtrail',
    actorKind: 'engine',
    answer: 'Exports rows',
    author: 'Scout-1',
  });
  assert.equal(await s.phase(), 'done');
  assert.deepEqual(
    (await s.plan()).plan.map((g) => [g.kind, g.owner, g.action]),
    [['criteria-unconfirmed', 'you', 'confirm-and-verify']],
  );
  s.confirm();
  assert.deepEqual(
    (await s.plan()).plan.map((g) => g.action),
    ['verify-again'],
  );
  assert.deepEqual(await checkAgainOnConfirm(s.env, { mapId: s.mapId, ticketId: s.id, by: 'trail lead' }), {
    attemptId: 'A-2',
  });
  await new Promise((x) => setTimeout(x, 50));
  assert.equal(await s.until('done'), 'done');
  assert.equal((await s.plan()).proof.status, 'verified');
  const decisions = (await s.adapter.listDecisions(s.mapId)).filter((d) => d.ticketId === s.id);
  assert.equal(decisions.filter((d) => !d.supersededBy).length, 1);
  const events = journalFile(s.root)
    .read(s.mapId)
    .map((e) => e.event);
  assert.deepEqual(events.slice(-2), ['verify-again', 'checks.pass']);
});

test('the code moved on: confirming checks nothing again, a new completion is the only way', async () => {
  const s = await setup();
  writeFileSync(path.join(s.repo, 'later.ts'), 'x');
  s.git('add', 'later.ts');
  s.git('commit', '-qm', 'later');
  s.confirm();
  const again = await checkAgainOnConfirm(s.env, { mapId: s.mapId, ticketId: s.id, by: 'trail lead' });
  assert.ok('skipped' in again);
  assert.match(again.skipped, /moved on since A-1.*new completion/);
  assert.equal(readAttempts(s.root, s.mapId, s.id).length, 1);
});
