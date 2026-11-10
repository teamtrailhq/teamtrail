import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { journalFile } from '../src/history/journalFile';
import type { VerificationLevel } from '../src/model/lifecycle';
import { derivePhases } from '../src/planning/lifecycle/phase';
import { openReviews } from '../src/planning/lifecycle/reviewTicket';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { chooseNext, claim } from '../src/planning/operations/claims';
import { approvalItems } from '../src/verification/approvals';
import { readVerdicts } from '../src/verification/evidenceStore';
import { operatorAction } from '../src/verification/operatorActions';
import { reviewConflict } from '../src/verification/reviewIndependence';
import { submitReview, type ReviewSubmission } from '../src/verification/submitReview';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const config = (extra: object = {}) =>
  JSON.stringify({ v: 1, checks: { ok: { run: [process.execPath, '-e', 'process.exit(0)'] } }, run: ['ok'], ...extra });

/** One execute ticket worked by Scout-1 whose checks passed, so it waits for review. */
async function setup(level: VerificationLevel) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-review-'));
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  writeFileSync(path.join(root, 'verification.json'), config());
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Review',
    sections: SECTIONS,
    verification: level,
    tickets: [
      { ref: 'a', title: 'Build it', type: 'execute', body: '' },
      { ref: 'b', title: 'Other work', type: 'research', body: '' },
    ],
  });
  const env = { adapter, root, journal: journalFile(root) };
  const id = tickets[0].id;
  const worker = { actor: 'Scout-1', actorKind: 'agent' as const, sessionId: 's_work' };
  const complete = async () => {
    await transition(adapter, map.id, id, { ...worker, event: 'claim' });
    await transition(adapter, map.id, id, { ...worker, event: 'submit' });
    const snap = await adapter.loadMap(map.id);
    const t = snap.tickets.find((x) => x.id === id)!;
    const info = levelFor(root, snap, t).info;
    return (
      await verify(env, {
        mapId: map.id,
        ticket: t,
        info,
        sub: { agent: 'Scout-1', sessionId: 's_work', resolution: 'built it' },
      })
    ).done;
  };
  await complete();
  const snap = () => adapter.loadMap(map.id);
  const phase = async () => derivePhases((await snap()).tickets).get(id);
  const review = async () => openReviews(await snap(), id)[0];
  const answer = async (agent: string, r: Partial<ReviewSubmission>) => {
    const rv = (await review())!;
    await claim(adapter, map.id, rv.id, { assignee: agent });
    return submitReview(env, {
      mapId: map.id,
      reviewId: rv.id,
      agent,
      sessionIds: [`s_${agent}`],
      verdict: 'PASS',
      summary: 'Looks right',
      ...r,
    });
  };
  return { root, adapter, env, mapId: map.id, id, snap, phase, review, answer, complete };
}

test('a pass at checks+review waits in verifying with a review ticket naming the work', async () => {
  const s = await setup('checks+review');
  assert.equal(await s.phase(), 'verifying');
  const rv = (await s.review())!;
  assert.equal(rv.type, 'review');
  assert.equal(rv.reviewOf, s.id);
  assert.match(rv.title, /^Review #2: Build it/);
  assert.match(rv.body, /A-1, checks passed, by Scout-1/);
  assert.match(rv.body, /submit_review/);
  assert.equal(chooseNext(await s.snap())?.id, rv.id, 'reviews come before new work');
  assert.equal(chooseNext(await s.snap(), { exclude: [rv.id] })?.type, 'research');
});

test('the agent or session that did the work cannot review it', async () => {
  const s = await setup('checks+review');
  const t = (await s.snap()).tickets.find((x) => x.id === s.id)!;
  assert.match(reviewConflict(s.root, s.mapId, t, { agent: 'Scout-1', sessionIds: [] })!, /Scout-1 worked on #2/);
  assert.match(reviewConflict(s.root, s.mapId, t, { agent: 'Scout-7', sessionIds: ['s_work'] })!, /this connection/);
  assert.equal(reviewConflict(s.root, s.mapId, t, { agent: 'Scout-2', sessionIds: ['s_other'] }), undefined);
  await assert.rejects(s.answer('Scout-1', {}), /Scout-1 worked on #2/);
  assert.equal(await s.phase(), 'verifying');
});

test('FAIL sends the work back with findings; the next pass gets a new review, and PASS finishes it', async () => {
  const s = await setup('checks+review');
  const failed = await s.answer('Scout-2', {
    verdict: 'FAIL',
    summary: 'Misses the empty case',
    findings: [{ path: 'src/a.ts', line: 3, severity: 'error', text: 'empty input throws' }],
  });
  assert.equal(failed.phase, 'rework');
  assert.equal(await s.review(), undefined, 'the review ticket is closed');
  const v = readVerdicts(s.root, s.mapId, s.id);
  assert.deepEqual(
    v.map((x) => [x.id, x.attemptId, x.by, x.byKind, x.verdict]),
    [['V-1', 'A-1', 'Scout-2', 'agent', 'FAIL']],
  );
  const comments = (await s.snap()).tickets.find((x) => x.id === s.id)!.comments.map((c) => c.body);
  assert.ok(comments.some((c) => /Review V-1 of A-1: FAIL/.test(c) && /src\/a\.ts:3/.test(c)));

  await s.complete();
  assert.equal(await s.phase(), 'verifying');
  const passed = await s.answer('Scout-2', {});
  assert.equal(passed.phase, 'done');
  const t = (await s.snap()).tickets.find((x) => x.id === s.id)!;
  assert.equal(t.state, 'closed');
  const reviews = (await s.snap()).tickets.filter((x) => x.type === 'review');
  assert.deepEqual(
    reviews.map((x) => [x.state, x.closeReason]),
    [
      ['closed', 'completed'],
      ['closed', 'completed'],
    ],
  );
});

test('checks+review+human: a PASS waits for the trail lead, who approves from the inbox list', async () => {
  const s = await setup('checks+review+human');
  assert.deepEqual(approvalItems(s.root, await s.snap()), [], 'nothing waits on the trail lead before review');
  const r = await s.answer('Scout-2', { summary: 'Does what it says' });
  assert.equal(r.phase, 'verifying');
  const [item] = approvalItems(s.root, await s.snap());
  assert.deepEqual([item.kind, item.ticketKey, item.attemptId], ['approve', '#2', 'A-1']);
  assert.match(item.reason, /Scout-2 reviewed: Does what it says/);
  await operatorAction(s.env, { action: 'approve', mapId: s.mapId, ticketId: s.id, by: 'trail lead' });
  assert.equal(await s.phase(), 'done');
  assert.deepEqual(approvalItems(s.root, await s.snap()), []);
});

test('NEEDS_HUMAN holds the ticket for the trail lead', async () => {
  const s = await setup('checks+review');
  const r = await s.answer('Scout-2', { verdict: 'NEEDS_HUMAN', summary: 'Needs a product call on retention' });
  assert.equal(r.phase, 'blocked');
  const [item] = approvalItems(s.root, await s.snap());
  assert.equal(item.kind, 'held');
  assert.match(item.reason, /Scout-2 asks you to decide: Needs a product call/);
});

test('a PASS on code that changed since its checks ran runs them again instead (stale: reverify)', async () => {
  const s = await setup('checks+review');
  writeFileSync(path.join(s.root, 'verification.json'), config({ stale: 'reverify', maxAttempts: 4 }));
  approveAllHere(s.root);
  const r = await s.answer('Scout-2', {});
  assert.equal(r.phase, 'verifying');
  assert.equal(r.attemptId, 'A-2');
  for (let i = 0; i < 100 && !(await s.review()); i++) await new Promise((x) => setTimeout(x, 50));
  assert.match((await s.review())!.body, /A-2, checks passed/, 'the new pass is reviewed again');
});

test('when the trail lead decides first, the open review is withdrawn', async () => {
  const s = await setup('checks+review');
  const rv = (await s.review())!;
  await operatorAction(s.env, { action: 'approve', mapId: s.mapId, ticketId: s.id, by: 'trail lead' });
  const after = (await s.snap()).tickets.find((x) => x.id === rv.id)!;
  assert.deepEqual([after.state, after.closeReason], ['closed', 'not_planned']);
  await claim(s.adapter, s.mapId, rv.id, { assignee: 'Scout-2' }).catch(() => {});
  await assert.rejects(
    submitReview(s.env, {
      mapId: s.mapId,
      reviewId: rv.id,
      agent: 'Scout-2',
      sessionIds: [],
      verdict: 'PASS',
      summary: 'late',
    }),
    /already closed/,
  );
});
