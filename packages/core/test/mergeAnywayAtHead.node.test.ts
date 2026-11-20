import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge } from '../src/bridge';
import { writeTicketSync } from '../src/evidence/syncStore';
import { journalFile } from '../src/history/journalFile';
import { PR_HEAD_MOVED } from '../src/model/mergeAnyway';
import type { TicketSync } from '../src/model/prEvidence';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { gapsHash } from '../src/proof/gapsHash';
import { mergeAcceptances } from '../src/proof/mergeAcceptances';
import { mergeAnyway } from '../src/proof/mergeAnyway';
import { mergeHead } from '../src/proof/mergeHead';
import { proofForTicket } from '../src/proof/proofForTicket';
import { proofMarkdown } from '../src/proof/proofMarkdown';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const HEAD = 'a'.repeat(40);
const MOVED = 'b'.repeat(40);
const GAP = 'Finished with no checks set: nothing was checked.';

/** A done task finished with no checks set: no attempt, so its proof names no commit. */
async function finishedUnchecked() {
  const repo = tempFolder('teamtrail-merge-head-');
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  writeFileSync(path.join(repo, '.gitignore'), '.teamtrail\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Landing',
    sections: SECTIONS,
    tickets: [{ ref: 'a', title: 'Write the hero copy', type: 'task', body: '' }],
  });
  const t = tickets[0];
  const agent = { actor: 'claude-01', actorKind: 'agent' as const };
  await transition(adapter, map.id, t.id, { ...agent, event: 'claim' });
  await transition(adapter, map.id, t.id, { ...agent, event: 'complete' });
  const s = { root, adapter, mapId: map.id, ticketId: t.id, key: t.key };
  const proof = async () => {
    const snap = await adapter.loadMap(map.id);
    const decisions = await adapter.listDecisions(map.id);
    return proofForTicket({ root, snap, ticket: snap.tickets[0], decisions });
  };
  /** Its pull request as PR sync keeps it. */
  const pr = (headSha: string, state: 'open' | 'merged' = 'open') =>
    writeTicketSync(root, {
      v: 1,
      mapId: map.id,
      ticketId: t.id,
      ticketKey: t.key,
      provider: 'GitHub',
      link: { number: 7, source: 'branch', at: 1 },
      pr: { number: 7, url: 'https://github.com/a/b/pull/7', state, headSha },
      checks: [],
      flags: [],
      syncedAt: 1,
    } as unknown as TicketSync);
  return { ...s, proof, pr };
}

test('mergeHead: the proof’s commit when it names one, else the open pull request’s head', () => {
  const pr = { number: 7, state: 'open', headSha: HEAD } as Parameters<typeof mergeHead>[0]['pr'];
  assert.deepEqual(mergeHead({ proof: { git: { head: MOVED } as never }, pr }), { head: MOVED, atPrHead: false });
  assert.deepEqual(mergeHead({ proof: {}, pr }), { head: HEAD, atPrHead: true, pr: 7 });
  assert.equal(mergeHead({ proof: {}, pr: { ...pr!, state: 'merged' } }), undefined);
  assert.equal(mergeHead({ proof: {} }), undefined);
});

test('Merge anyway with no commit in the proof: accepted at the pull request’s head the page showed', async () => {
  const s = await finishedUnchecked();
  const p = await s.proof();
  assert.equal(p.git?.head ?? null, null);
  assert.deepEqual(p.gaps, [GAP]);
  const env = { adapter: s.adapter, root: s.root };
  const ask = { mapId: s.mapId, ticketId: s.ticketId, gaps: p.gaps, via: 'lookout' as const };
  // no pull request: nothing to merge at
  await assert.rejects(mergeAnyway(env, { ...ask, head: HEAD }), /no open pull request/);
  s.pr(HEAD);
  await assert.rejects(mergeAnyway(env, ask), /say which head/);
  // the page showed a head the pull request has moved past
  s.pr(MOVED);
  await assert.rejects(mergeAnyway(env, { ...ask, head: HEAD }), (e: Error) => e.message === PR_HEAD_MOVED);
  assert.equal(mergeAcceptances.latest(s.root, s.mapId, s.ticketId), undefined);
  const r = await mergeAnyway(env, { ...ask, head: MOVED, person: 'Ada' });
  assert.equal(r.head, MOVED);
  assert.equal(r.atPrHead, true);
  // the gaps hash covers that head
  assert.equal(r.gapsHash, gapsHash({ head: MOVED, gaps: p.gaps }));
  const kept = mergeAcceptances.latest(s.root, s.mapId, s.ticketId);
  assert.equal(kept?.head, MOVED);
  assert.equal(kept?.atPrHead, true);
  assert.equal(kept?.pr, 7);
  // the decision says plainly where it was accepted, and so does the proof's Markdown
  const d = (await s.adapter.listDecisions(s.mapId)).find((x) => x.source.ref === `merge:${r.acceptance}`);
  assert.equal(d?.summary, `Merge anyway accepted at head ${MOVED} without a verified proof`);
  assert.match(
    proofMarkdown(await s.proof()),
    new RegExp(`Merge anyway accepted at head ${MOVED} without a verified proof`),
  );
  const [entry] = journalFile(s.root).readMergeAnyway(s.mapId);
  assert.deepEqual([entry.head, entry.atPrHead, entry.actor], [MOVED, true, 'Ada']);
});

test('covering: a server that merges finds the record by its gaps hash, only while it is about the proof as it is', async () => {
  const s = await finishedUnchecked();
  s.pr(HEAD);
  const p = await s.proof();
  const env = { adapter: s.adapter, root: s.root };
  const r = await mergeAnyway(env, { mapId: s.mapId, ticketId: s.ticketId, gaps: p.gaps, head: HEAD, via: 'lookout' });
  const ask = { mapId: s.mapId, ticketId: s.ticketId };
  const now = await s.proof();
  assert.equal(mergeAcceptances.covering(s.root, { ...ask, gapsHash: r.gapsHash, proof: now })?.head, HEAD);
  // a hash of another head or other gaps covers nothing
  const other = gapsHash({ head: MOVED, gaps: p.gaps });
  assert.equal(mergeAcceptances.covering(s.root, { ...ask, gapsHash: other, proof: now }), undefined);
  // the proof changed: other gaps, or a commit of its own, which the head at the pull request isn't about
  assert.equal(mergeAcceptances.covering(s.root, { ...ask, gapsHash: r.gapsHash, proof: { gaps: ['x'] } }), undefined);
  const named = { gaps: now.gaps, git: { ...now.git!, head: HEAD } };
  assert.equal(mergeAcceptances.covering(s.root, { ...ask, gapsHash: r.gapsHash, proof: named }), undefined);
});

test('POST /proof/merge-anyway refuses a head the pull request moved past; GET /proof/ticket hashes at its head', async () => {
  const s = await finishedUnchecked();
  s.pr(HEAD);
  const bridge = createTrackerBridge(s.root, { env: {}, leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/proof`;
  const post = (body: unknown) =>
    fetch(`${base}/merge-anyway`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const ticket = async () =>
    (await (await fetch(`${base}/ticket?mapId=${s.mapId}&ticketId=${s.ticketId}`)).json()) as {
      proof: { gaps: string[] };
      gapsHash: string;
      mergeAnyway?: { by: string };
    };
  try {
    const before = await ticket();
    assert.equal(before.gapsHash, gapsHash({ head: HEAD, gaps: before.proof.gaps }));
    const body = { mapId: s.mapId, ticketId: s.ticketId, gaps: before.proof.gaps, head: HEAD };
    assert.equal((await post({ ...body, head: 'not a sha' })).status, 400);
    s.pr(MOVED);
    const stale = await post(body);
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), { error: PR_HEAD_MOVED });
    const ok = await post({ ...body, head: MOVED });
    assert.equal(ok.status, 200);
    const made = (await ok.json()) as { gapsHash: string; head: string; atPrHead: boolean };
    assert.deepEqual([made.head, made.atPrHead], [MOVED, true]);
    const after = await ticket();
    assert.equal(after.gapsHash, made.gapsHash);
    assert.equal(after.mergeAnyway?.by, 'trail lead');
    // the pull request moved again: the acceptance no longer covers what the page shows
    s.pr('c'.repeat(40));
    assert.equal((await ticket()).mergeAnyway, undefined);
  } finally {
    server.close();
    bridge.close();
  }
});
