import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import type { TrackerAdapter } from '../src/adapters/adapter';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { writeTicketSync } from '../src/evidence/syncStore';
import type { TicketSync } from '../src/model/prEvidence';
import type { ProofPublisher } from '../src/model/proofPost';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { readProofPost } from '../src/proof/proofPostStore';
import { publishProofs } from '../src/proof/publishProofs';
import { evidencePaths, writeAttempt } from '../src/verification/evidenceStore';

const SHA_A = 'a'.repeat(40);
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const dirs: string[] = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A publisher that keeps one comment per PR and every status set, in memory; `failing` makes every call throw. */
function memoryPublisher() {
  const comments = new Map<number, string>();
  const statuses: { sha: string; state: string; description: string }[] = [];
  let failing = false;
  const publisher: ProofPublisher = {
    repo: 'o/r',
    async upsertComment(pr, body) {
      if (failing) throw new Error('offline');
      comments.set(pr, body);
      return { url: `https://github.com/o/r/pull/${pr}#proof` };
    },
    async setStatus(sha, s) {
      if (failing) throw new Error('offline');
      statuses.push({ sha, state: s.state, description: s.description });
    },
  };
  return { comments, statuses, publisher, fail: (on: boolean) => (failing = on) };
}

/** The adapter with some tickets, or whole trails, gone: as if they were deleted from the tracker. */
function without(a: TrackerAdapter, gone: { tickets?: string[]; maps?: string[] }): TrackerAdapter {
  return new Proxy(a, {
    get(t, prop) {
      if (prop === 'listMaps') return async () => (await t.listMaps()).filter((m) => !gone.maps?.includes(m.id));
      if (prop === 'loadMap')
        return async (id: string) => {
          const snap = await t.loadMap(id);
          return { ...snap, tickets: snap.tickets.filter((x) => !gone.tickets?.includes(x.id)) };
        };
      const v = Reflect.get(t, prop);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

/** One trail with one done, verified ticket whose PR #4 is open at the verified commit. */
async function postedProof() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-proof-removed-'));
  dirs.push(root);
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(a, {
    title: 'Checkout',
    sections: SECTIONS,
    tickets: [{ ref: 'a', title: 'Free shipping', type: 'execute', body: '' }],
  });
  const t = tickets[0];
  const git = { v: 1, tree: { toplevel: '/r', head: SHA_A, branch: 'b', fingerprint: 'sha256:0' } };
  writeAttempt(root, {
    ...{ v: 1, id: 'A-1', mapId: map.id, ticketId: t.id, ticketKey: t.key, agent: 'claude-01', level: 'checks' },
    ...{ configHash: 'h', submittedAt: 1, finishedAt: 2, resolution: 'done', checks: [], result: 'pass' },
    git: { ...git, changed: [], stats: { files: 1, add: 1, del: 0 }, flags: [] } as VerificationAttempt['git'],
  });
  await a.close(map.id, t.id, 'completed');
  writeTicketSync(root, {
    ...{ v: 1, mapId: map.id, ticketId: t.id, ticketKey: t.key, provider: 'github' },
    link: { number: 4, source: 'explicit', at: 0 },
    pr: { number: 4, state: 'open', headSha: SHA_A } as TicketSync['pr'],
    ...{ checks: [], checksSummary: 'none', flags: [] },
  });
  const gh = memoryPublisher();
  await publishProofs({ root, adapter: a, publisher: gh.publisher });
  assert.equal(gh.statuses.at(-1)?.state, 'success');
  return { root, a, mapId: map.id, t, gh };
}

for (const what of ['ticket', 'trail'] as const)
  test(`a removed ${what} takes its proof's green status off its PR, once, and its record goes`, async () => {
    const { root, a, mapId, t, gh } = await postedProof();
    const gone = what === 'ticket' ? without(a, { tickets: [t.id] }) : without(a, { maps: [mapId] });
    const env = { root, adapter: gone, publisher: gh.publisher };
    const posted = await publishProofs(env);
    assert.deepEqual(
      posted.map((r) => [r.pr, r.state]),
      [[4, 'failure']],
    );
    assert.deepEqual(gh.statuses.at(-1), {
      sha: SHA_A,
      state: 'failure',
      description: 'The ticket this proof was for was removed',
    });
    const comment = gh.comments.get(4)!;
    assert.ok(comment.startsWith('<!-- teamtrail:proof '), 'the same comment, found again by its marker');
    assert.match(comment, /Not verified by Teamtrail/);
    assert.match(comment, /was removed/);
    assert.equal(readProofPost(root, mapId, t.id), undefined, 'the record goes');
    const statuses = gh.statuses.length;
    assert.deepEqual(await publishProofs(env), [], 'once');
    assert.equal(gh.statuses.length, statuses);
  });

test('a withdrawal that fails is tried again on the next pass; a ticket still there is never withdrawn', async () => {
  const { root, a, mapId, t, gh } = await postedProof();
  assert.deepEqual(await publishProofs({ root, adapter: a, publisher: gh.publisher }), [], 'still there: nothing');
  const env = { root, adapter: without(a, { tickets: [t.id] }), publisher: gh.publisher };
  gh.fail(true);
  const [failed] = await publishProofs(env);
  assert.match(failed.error ?? '', /offline/);
  assert.ok(existsSync(path.join(root, evidencePaths.ticket(mapId, t.id), 'proof-post.json')), 'kept for a retry');
  gh.fail(false);
  assert.deepEqual(
    (await publishProofs(env)).map((r) => r.state),
    ['failure'],
  );
  assert.equal(gh.statuses.at(-1)?.state, 'failure');
  assert.equal(readProofPost(root, mapId, t.id), undefined);
});
