import assert from 'node:assert/strict';
import { rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { reconcile } from '../src/evidence/reconcile';
import { MEMO_MS, reconcileMemo } from '../src/evidence/reconcileMemo';
import { readTicketSync, readTicketSyncs, writeSyncStatus } from '../src/evidence/syncStore';
import type { CiProvider, PrCandidate, PullRequestSnapshot } from '../src/model/prEvidence';
import { chartMap } from '../src/planning/operations/chart';
import { readReviewLoad } from '../src/reviewLoad/readReviewLoad';
import { writeAttempt } from '../src/verification/evidenceStore';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const HEAD = 'a'.repeat(40);

const snap = (number: number, state: PullRequestSnapshot['state'], updatedAt = 1): PullRequestSnapshot => ({
  ...{ number, url: '', title: '', state, draft: false, headSha: HEAD, headRef: 'feat', sameRepo: true },
  ...{ review: 'none', mergeable: 'unknown', updatedAt },
  ...(state === 'merged' ? { mergeCommit: 'b'.repeat(40) } : {}),
});

/** A trail of done tickets; each ticket's completion names `pr` (when given) and `branch`. */
async function trail(ticketsDone: { pr?: number; branch?: string }[]) {
  const root = tempFolder('teamtrail-reconcile-');
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(a, {
    title: 'T',
    sections: SECTIONS,
    tickets: ticketsDone.map((_, i) => ({ ref: `r${i}`, title: `X${i}`, type: 'execute' as const, body: '' })),
  });
  for (const [i, t] of tickets.entries()) {
    const { pr, branch } = ticketsDone[i];
    const tree = { toplevel: '/r', head: HEAD, branch: branch ?? null, fingerprint: 'x' };
    writeAttempt(root, {
      ...{ v: 1, id: 'A-1', mapId: map.id, ticketId: t.id, ticketKey: t.key, agent: 'x', level: 'checks' },
      ...{ configHash: 'h', submittedAt: 1, finishedAt: 2, resolution: 'done', checks: [], result: 'pass' },
      ...(pr ? { pr } : {}),
      git: { v: 1, tree, changed: [], stats: { files: 1, add: 1, del: 0 }, flags: [] },
    });
    await a.close(map.id, t.id, 'completed');
  }
  return { root, a, mapId: map.id, tickets };
}

/** A provider over `prs` that counts its calls; `markers` makes every PR carry the ticket's marker. */
function provider(o: { prs: () => PullRequestSnapshot[]; recent?: () => PrCandidate[] }) {
  const calls: string[] = [];
  const p: CiProvider = {
    name: 'github',
    repo: 'o/r',
    recent: async () => (calls.push('recent'), o.recent?.() ?? o.prs().map((pr) => ({ pr, markers: [] }))),
    forBranch: async (b) => (calls.push(`forBranch ${b}`), o.prs().filter((pr) => pr.headRef === b)),
    pull: async (n) => (calls.push(`pull ${n}`), o.prs().find((pr) => pr.number === n)!),
    checks: async () => (calls.push('checks'), []),
  };
  return { p, calls };
}

for (const via of ['branch', 'marker', 'attempt'] as const)
  test(`a PR closed without merging gives way to its replacement (linked by ${via})`, async () => {
    const { root, a, mapId, tickets } = await trail([
      via === 'attempt' ? { pr: 4, branch: 'feat' } : { branch: 'feat' },
    ]);
    const t = tickets[0];
    let prs = [snap(4, 'open')];
    const ref = `${mapId}#${t.id}`;
    const markers = via === 'marker' ? [ref] : [];
    const { p } = provider({ prs: () => prs, recent: () => prs.map((pr) => ({ pr, markers })) });
    const env = { root, adapter: a, provider: p, requiredChecks: [] };
    await reconcile(env);
    assert.equal(readTicketSync(root, mapId, t.id)?.link.number, 4);

    prs = [snap(5, 'merged', 3), snap(4, 'closed', 2)];
    await reconcile(env); // reads #4 closed
    await reconcile(env); // moves to #5
    await reconcile(env); // and stays there
    const s = readTicketSync(root, mapId, t.id)!;
    assert.deepEqual([s.link.number, s.pr?.state, s.replaced], [5, 'merged', [4]]);
    assert.ok(!s.flags.some((f) => f.kind === 'pr-closed-unmerged'), 'the closed-without-merging alert is gone');
  });

test('a link the trail lead set by hand stays on its closed PR', async () => {
  const { root, a, mapId, tickets } = await trail([{ branch: 'feat' }]);
  const t = tickets[0];
  const { writeTicketSync } = await import('../src/evidence/syncStore');
  writeTicketSync(root, {
    ...{ v: 1, mapId, ticketId: t.id, ticketKey: t.key, provider: 'github' },
    ...{ link: { number: 4, source: 'explicit', at: 0 }, pr: snap(4, 'closed'), checks: [] },
    ...{ checksSummary: 'none', flags: [] },
  });
  const { p } = provider({ prs: () => [snap(5, 'open'), snap(4, 'closed')] });
  await reconcile({ root, adapter: a, provider: p, requiredChecks: [] });
  assert.equal(readTicketSync(root, mapId, t.id)?.link.number, 4);
});

test('settled PRs and branches without a PR are not asked about every tick, and nothing unchanged is rewritten', async () => {
  const { root, a, mapId, tickets } = await trail([{ pr: 10 }, { branch: 'nothing-here' }]);
  const old = snap(10, 'merged');
  let now = 1_000_000;
  // #10 merged long ago: it isn't among the recent PRs any more
  const { p, calls } = provider({ prs: () => [old], recent: () => [] });
  const env = { root, adapter: a, provider: p, requiredChecks: [], memo: reconcileMemo(), now: () => now };
  await reconcile(env);
  assert.deepEqual(calls, ['recent', 'pull 10', 'checks', 'forBranch nothing-here']);
  const file = path.join(root, '.evidence', mapId, tickets[0].id, 'sync.json');
  const written = statSync(file).mtimeMs;

  calls.length = 0;
  now += 60_000;
  const r = await reconcile(env);
  assert.deepEqual(calls, ['recent'], 'a tick a minute later reads nothing it already knows');
  assert.deepEqual(r.changed, []);
  assert.equal(statSync(file).mtimeMs, written, 'sync.json is not rewritten when nothing changed');

  calls.length = 0;
  now += MEMO_MS;
  await reconcile(env);
  assert.deepEqual(calls, ['recent', 'pull 10', 'checks', 'forBranch nothing-here'], 'read again after an hour');
});

test("a deleted trail's PR snapshots are dropped, so its PRs never count in the review queue again", async () => {
  const { root, a, mapId } = await trail([{ pr: 4 }, { pr: 5 }]);
  const { p } = provider({ prs: () => [snap(4, 'open'), snap(5, 'open')] });
  await reconcile({ root, adapter: a, provider: p, requiredChecks: [] });
  const snaps = async () => Promise.all((await a.listMaps()).map((m) => a.loadMap(m.id)));
  assert.equal(readReviewLoad(root, await snaps()).waiting.length, 2, 'both PRs wait for review');

  rmSync(path.join(root, mapId), { recursive: true, force: true });
  await reconcile({ root, adapter: a, provider: p, requiredChecks: [] });
  assert.deepEqual(readTicketSyncs(root), []);
  assert.equal(readReviewLoad(root, await snaps()).waiting.length, 0);
});

test('a PR sync nobody keeps running holds no work back', async () => {
  const { root, a } = await trail([{ pr: 4 }]);
  const { p } = provider({ prs: () => [snap(4, 'open')] });
  await reconcile({ root, adapter: a, provider: p, requiredChecks: [] });
  const snaps = await Promise.all((await a.listMaps()).map((m) => a.loadMap(m.id)));
  const now = Date.now();
  writeSyncStatus(root, { state: 'ok', lastOkAt: now, nextAt: now + 60_000 });
  assert.equal(readReviewLoad(root, snaps, now).waiting.length, 1);
  writeSyncStatus(root, { state: 'ok', lastOkAt: now - 3_600_000, nextAt: now - 3_000_000 });
  assert.equal(readReviewLoad(root, snaps, now).waiting.length, 0, 'no Lookout keeps PR state current');
  writeSyncStatus(root, { state: 'off', reason: 'github.enabled is off', nextAt: now + 60_000 });
  assert.equal(readReviewLoad(root, snaps, now).waiting.length, 0, 'sync switched off');
});
