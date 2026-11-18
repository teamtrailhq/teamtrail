import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { writeTicketSync } from '../src/evidence/syncStore';
import type { TicketSync } from '../src/model/prEvidence';
import type { ProofPublisher } from '../src/model/proofPost';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { proofStatus } from '../src/proof/proofStatus';
import { publishProofs } from '../src/proof/publishProofs';
import { verifyProofText } from '../src/proof/verifyProofText';
import { writeAttempt } from '../src/verification/evidenceStore';

const SHA_A = 'a'.repeat(40);
const SHA_C = 'c'.repeat(40);
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

/** A publisher that keeps one comment per PR and every status set, in memory. */
function memoryPublisher() {
  const comments = new Map<number, string>();
  const statuses: { sha: string; state: string; description: string }[] = [];
  const publisher: ProofPublisher = {
    repo: 'o/r',
    async upsertComment(pr, body) {
      comments.set(pr, body);
      return { url: `https://github.com/o/r/pull/${pr}#proof` };
    },
    async setStatus(sha, s) {
      statuses.push({ sha, state: s.state, description: s.description });
    },
  };
  return { comments, statuses, publisher };
}

/** One trail with one done ticket; `git: false` records its completion without git evidence (no commit named). */
async function doneTicket(o: { git: boolean }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-proof-life-'));
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(a, {
    title: 'Checkout',
    sections: SECTIONS,
    tickets: [{ ref: 'a', title: 'Free shipping', type: 'execute', body: '' }],
  });
  const t = tickets[0];
  const git: VerificationAttempt['git'] = {
    v: 1,
    tree: { toplevel: '/r', head: SHA_A, branch: 'b', fingerprint: 'sha256:0' },
    changed: [],
    stats: { files: 1, add: 1, del: 0 },
    flags: [],
  };
  writeAttempt(root, {
    ...{ v: 1, id: 'A-1', mapId: map.id, ticketId: t.id, ticketKey: t.key, agent: 'claude-01', level: 'checks' },
    ...{ configHash: 'h', submittedAt: 1, finishedAt: 2, resolution: 'done', checks: [], result: 'pass' },
    ...(o.git ? { git } : {}),
  });
  await a.close(map.id, t.id, 'completed');
  const sync = (headSha: string, state: 'open' | 'merged' = 'open') =>
    writeTicketSync(root, {
      ...{ v: 1, mapId: map.id, ticketId: t.id, ticketKey: t.key, provider: 'github' },
      link: { number: 4, source: 'explicit', at: 0 },
      pr: { number: 4, state, headSha } as TicketSync['pr'],
      ...{ checks: [], checksSummary: 'none', flags: [] },
    });
  return { root, a, mapId: map.id, t, sync };
}

test('a reopened ticket withdraws its proof: the PR gets a failing status and a not verified report', async () => {
  const { root, a, mapId, t, sync } = await doneTicket({ git: true });
  const gh = memoryPublisher();
  const env = { root, adapter: a, publisher: gh.publisher };
  sync(SHA_A);
  await publishProofs(env);
  assert.equal(gh.statuses.at(-1)?.state, 'success');

  await a.reopen(mapId, t.id);
  const withdrawn = await publishProofs(env);
  assert.deepEqual(
    withdrawn.map((r) => r.state),
    ['failure'],
  );
  assert.equal(gh.statuses.at(-1)?.state, 'failure');
  assert.match(gh.statuses.at(-1)!.description, /isn't done any more/);
  assert.match(gh.comments.get(4)!, /isn't done any more/, 'the comment is edited, no longer Verified');
  assert.match(gh.comments.get(4)!, /Not verified by Teamtrail/);
  assert.deepEqual(await publishProofs(env), [], 'withdrawn once');

  await a.close(mapId, t.id, 'completed');
  assert.deepEqual(
    (await publishProofs(env)).map((r) => r.state),
    ['success'],
    'done again: verified again',
  );
});

test('a reopened ticket whose proof was never posted posts nothing', async () => {
  const { root, a, mapId, t, sync } = await doneTicket({ git: true });
  const gh = memoryPublisher();
  await a.reopen(mapId, t.id);
  sync(SHA_A);
  assert.deepEqual(await publishProofs({ root, adapter: a, publisher: gh.publisher }), []);
});

test('a proof that names no commit never gives a PR a green status, before or after a force-push', async () => {
  const { root, a, sync } = await doneTicket({ git: false });
  const gh = memoryPublisher();
  const env = { root, adapter: a, publisher: gh.publisher };
  sync(SHA_A);
  const [first] = await publishProofs(env);
  sync(SHA_C);
  const [pushed] = await publishProofs(env);
  assert.deepEqual([first.state, pushed.state], ['failure', 'failure']);
  assert.match(gh.statuses[0].description, /names no commit/);
  // `teamtrail proof verify` says the same of the comment it posted
  const checked = verifyProofText({ text: gh.comments.get(4)!, keys: new Map(), head: SHA_C });
  assert.equal(checked.verified, false);
});

test('proofStatus and verifyProofText agree on which head a proof covers', () => {
  const proof = (head?: string) =>
    ({ status: 'verified', gaps: [], ticket: { key: '#1', title: 'T' }, ...(head ? { git: { head } } : {}) }) as never;
  assert.equal(proofStatus(proof(SHA_A), SHA_A).state, 'success');
  assert.equal(proofStatus(proof(SHA_A.slice(0, 12)), SHA_A).state, 'success', 'an abbreviated head still covers it');
  assert.equal(proofStatus(proof(SHA_A), SHA_C).state, 'failure');
  assert.equal(proofStatus(proof(), SHA_A).state, 'failure');
  assert.equal(proofStatus(proof('aaa'), SHA_A).state, 'failure', 'too short to name a commit');
});

test('a PR merged before any pass saw it open gets its proof once', async () => {
  const { root, a, sync } = await doneTicket({ git: true });
  const gh = memoryPublisher();
  const env = { root, adapter: a, publisher: gh.publisher };
  sync(SHA_A, 'merged');
  assert.deepEqual(
    (await publishProofs(env)).map((r) => [r.pr, r.state]),
    [[4, 'success']],
  );
  assert.equal(gh.statuses.length, 1);
  assert.deepEqual(await publishProofs(env), [], 'once');
});
