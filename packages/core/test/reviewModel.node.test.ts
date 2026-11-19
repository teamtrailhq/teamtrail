import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { journalFile } from '../src/history/journalFile';
import type { GateMode } from '../src/model/gateMode';
import { derivePhases } from '../src/planning/lifecycle/phase';
import { openReviews } from '../src/planning/lifecycle/reviewTicket';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { claim } from '../src/planning/operations/claims';
import { proofForTicket } from '../src/proof/proofForTicket';
import { proofMarkdown } from '../src/proof/proofMarkdown';
import { approvalItems } from '../src/verification/approvals';
import { readAttempts, readVerdicts } from '../src/verification/evidenceStore';
import { operatorAction } from '../src/verification/operatorActions';
import { reviewedWork } from '../src/verification/reviewedWork';
import { submitReview } from '../src/verification/submitReview';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const OPUS = 'claude-opus-5-5';

/** One execute ticket Scout-1 did on claude-opus-5-5, its checks passed, waiting for review at `checks+review`. */
async function setup(gate: GateMode) {
  const repo = tempFolder('teamtrail-review-model-');
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  const checks = { ok: { run: [process.execPath, '-e', 'process.exit(0)'] } };
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, checks, run: ['ok'], gates: { 'independent-review': gate } }),
  );
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Review models',
    sections: SECTIONS,
    verification: 'checks+review',
    tickets: [{ ref: 'a', title: 'Build it', type: 'execute', body: '' }],
  });
  const env = { adapter, root, journal: journalFile(root) };
  const id = tickets[0].id;
  const worker = { actor: 'Scout-1', actorKind: 'agent' as const, sessionId: 's_work' };
  await transition(adapter, map.id, id, { ...worker, event: 'claim' });
  await transition(adapter, map.id, id, { ...worker, event: 'submit' });
  const first = await adapter.loadMap(map.id);
  const t = first.tickets.find((x) => x.id === id)!;
  const sub = { agent: 'Scout-1', sessionId: 's_work', model: OPUS, resolution: 'built it' };
  await (
    await verify(env, { mapId: map.id, ticket: t, info: levelFor(root, first, t).info, sub })
  ).done;
  const snap = () => adapter.loadMap(map.id);
  const phase = async () => derivePhases((await snap()).tickets).get(id);
  const review = async () => openReviews(await snap(), id)[0];
  const answer = async (agent: string, model: string, verdict: 'PASS' | 'FAIL' = 'PASS') => {
    const rv = (await review())!;
    await claim(adapter, map.id, rv.id, { assignee: agent });
    const r = { mapId: map.id, reviewId: rv.id, agent, sessionIds: [`s_${agent}`], model, verdict };
    return submitReview(env, { ...r, summary: 'Looks right' });
  };
  const proof = async () => {
    const s = await snap();
    return proofForTicket({ root, snap: s, ticket: s.tickets.find((x) => x.id === id)!, decisions: [] });
  };
  const gates = () => journalFile(root).readGates(map.id);
  return { root, env, mapId: map.id, id, snap, phase, review, answer, proof, gates };
}

test('the attempt keeps the author model; a review on another model counts and the proof shows both', async () => {
  const s = await setup('enforce');
  assert.equal(readAttempts(s.root, s.mapId, s.id)[0].model, OPUS);
  assert.deepEqual(reviewedWork(s.root, s.mapId, (await s.review())!), {
    ticketId: s.id,
    authorModel: OPUS,
    held: false,
  });
  const r = await s.answer('codex-02', 'gpt-5.1-codex');
  assert.equal(r.phase, 'done');
  const [v] = readVerdicts(s.root, s.mapId, s.id);
  assert.deepEqual([v.model, v.authorModel, v.sameModel], ['gpt-5.1-codex', OPUS, undefined]);
  const p = await s.proof();
  assert.equal(p.status, 'verified');
  assert.equal(p.attempt.model, OPUS);
  assert.match(proofMarkdown(p), /on gpt\\-5\.1\\-codex, author on claude\\-opus\\-5\\-5/);
  assert.deepEqual(s.gates(), []);
});

test('off: a review on the same model counts and nothing is journaled', async () => {
  const s = await setup('off');
  const r = await s.answer('Scout-2', `${OPUS}-20261001`);
  assert.equal(r.phase, 'done');
  assert.equal(readVerdicts(s.root, s.mapId, s.id)[0].sameModel, undefined);
  assert.deepEqual(s.gates(), []);
  assert.equal((await s.proof()).status, 'verified');
});

test('observe: a review on the same model counts, is journaled, and the proof says so', async () => {
  const s = await setup('observe');
  const r = await s.answer('Scout-2', `us.anthropic.${OPUS}-v1:0`);
  assert.equal(r.phase, 'done');
  assert.equal(r.held, undefined);
  assert.equal(readVerdicts(s.root, s.mapId, s.id)[0].sameModel, 'observed');
  assert.deepEqual(
    s.gates().map((g) => [g.gate, g.mode, g.ticketKey]),
    [['independent-review', 'observe', '#2']],
  );
  assert.match(s.gates()[0].reason, /Scout-2 reviewed #2 on claude-opus-5-5, the model that did the work/);
  const p = await s.proof();
  assert.equal(p.status, 'verified');
  assert.equal(p.reviews[0].sameModel, 'observed');
  assert.match(proofMarkdown(p), /reviewed by the same model/);
});

test('enforce: a PASS on the same model waits for another model, and the trail lead can approve it anyway', async () => {
  const s = await setup('enforce');
  const first = (await s.review())!;
  const r = await s.answer('Scout-2', OPUS);
  assert.equal(r.phase, 'verifying');
  assert.equal(r.verdict.sameModel, 'held');
  const next = (await s.review())!;
  assert.notEqual(next.id, first.id, 'a new review ticket waits for another model');
  assert.deepEqual(r.held, { model: OPUS, review: next.key });
  assert.match(next.body, /needs an agent on another model/);
  assert.equal(reviewedWork(s.root, s.mapId, next).held, true);
  assert.deepEqual(
    s.gates().map((g) => g.mode),
    ['enforce'],
  );
  const [item] = approvalItems(s.root, await s.snap());
  assert.equal(item.kind, 'approve');
  assert.match(item.reason, new RegExp(`^Review ${next.key} waits for an agent on another model than ${OPUS}`));
  assert.match((await s.proof()).gaps.join(' '), /Scout-2 reviewed it on claude-opus-5-5, the model that did the work/);

  await operatorAction(s.env, { action: 'approve', mapId: s.mapId, ticketId: s.id, by: 'trail lead' });
  assert.equal(await s.phase(), 'done');
  assert.equal(await s.review(), undefined, 'the waiting review is withdrawn');
  const approved = journalFile(s.root)
    .read(s.mapId)
    .filter((e) => e.ticketId === s.id && e.event === 'approve');
  assert.equal(approved.length, 1, 'the approval is journaled');
  const p = await s.proof();
  assert.equal(p.status, 'not-verified', 'accepted past the gate, the proof says so');
  assert.match(p.gaps.join(' '), /No independent review passed it: Scout-2 reviewed it on claude-opus-5-5/);
});

test('enforce: after a held PASS, a review on another model counts', async () => {
  const s = await setup('enforce');
  await s.answer('Scout-2', OPUS);
  const r = await s.answer('codex-02', 'gpt-5.1-codex');
  assert.equal(r.phase, 'done');
  const p = await s.proof();
  assert.equal(p.status, 'verified');
  assert.deepEqual(
    p.reviews.map((x) => [x.by, x.independent, x.sameModel]),
    [
      ['Scout-2', false, 'held'],
      ['codex-02', true, undefined],
    ],
  );
});

test('enforce: a FAIL on the same model still sends the work back, marked', async () => {
  const s = await setup('enforce');
  const r = await s.answer('Scout-2', OPUS, 'FAIL');
  assert.equal(r.phase, 'rework');
  assert.equal(readVerdicts(s.root, s.mapId, s.id)[0].sameModel, 'observed');
  assert.deepEqual(s.gates(), [], 'nothing was held');
});
