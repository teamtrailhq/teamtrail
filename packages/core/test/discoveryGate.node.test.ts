import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { DISCOVERY_TICKET } from '../src/discovery/brief';
import { briefPath, writeBrief } from '../src/discovery/briefStore';
import { discoveryRefusal, requiresDiscovery } from '../src/discovery/discoveryGate';
import { journalFile } from '../src/history/journalFile';
import { chartMap } from '../src/planning/operations/chart';
import { approveReroute } from '../src/planning/reroute/decideReroute';
import { rerouteHash } from '../src/planning/reroute/rerouteApproval';
import { proposeReroute } from '../src/planning/reroute/rerouteFlow';
import { approveTrust } from '../src/trust/approveTrust';
import { pendingTrust } from '../src/trust/pendingTrust';
import { trustKey, trustLedger } from '../src/trust/trustLedger';
import { withCommitted } from '../src/trust/withCommitted';

/*
 * Whether a trail still requires discovery is this machine's fact: every trail does unless the trail lead skipped it
 * here. Deleting the brief file, or putting a folder in its place, opens nothing.
 */
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const EMPTY = {
  summary: '',
  productContext: '',
  existing: '',
  conventions: '',
  dataModel: '',
  api: '',
  risks: '',
  assumptions: [],
  openQuestions: [],
};
const MISSING = /the brief file is missing; only the trail lead can skip discovery/;

async function trail(withBrief: boolean) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-gate-'));
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root, { recursive: true });
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const tickets = [
    ...(withBrief ? [{ ref: 'd', ...DISCOVERY_TICKET }] : []),
    { ref: 'b', title: 'Build', type: 'execute' as const, body: '' },
  ];
  const { map, tickets: made } = await chartMap(adapter, { title: 'Exports', sections: SECTIONS, tickets });
  if (withBrief) writeBrief(root, { mapId: map.id, status: 'draft', ticketId: made[0].id, sections: EMPTY });
  return { repo, root, adapter, mapId: map.id };
}

test('a trail with a brief in progress: execute tickets wait', async () => {
  const t = await trail(true);
  assert.equal(requiresDiscovery(t.root, t.mapId), true);
  assert.match(discoveryRefusal(t.root, t.mapId, 'execute')!, /accepted discovery brief/);
  assert.equal(discoveryRefusal(t.root, t.mapId, 'research'), undefined);
});

test('the attack: an agent deletes the brief file; the gate holds', async () => {
  const t = await trail(true);
  rmSync(briefPath(t.root, t.mapId));
  assert.equal(requiresDiscovery(t.root, t.mapId), true);
  assert.match(discoveryRefusal(t.root, t.mapId, 'execute')!, MISSING);
});

test('the attack: an agent puts a folder where the brief file was; the gate holds', async () => {
  const t = await trail(true);
  rmSync(briefPath(t.root, t.mapId));
  mkdirSync(briefPath(t.root, t.mapId));
  assert.equal(requiresDiscovery(t.root, t.mapId), true);
  assert.match(discoveryRefusal(t.root, t.mapId, 'execute')!, MISSING);
});

test('a trail charted without a brief waits too, until the trail lead adopts it as running without discovery', async () => {
  const t = await trail(false);
  assert.equal(requiresDiscovery(t.root, t.mapId), true);
  const snaps = [await t.adapter.loadMap(t.mapId)];
  const item = pendingTrust(t.root, snaps).find((i) => i.kind === 'discovery')!;
  assert.equal(item.key, trustKey.discoverySkipped(t.mapId));
  approveTrust({ root: t.root, items: [{ key: item.key, hash: item.hash }], by: 'trail lead', snaps });
  assert.equal(requiresDiscovery(t.root, t.mapId), false);
  assert.equal(pendingTrust(t.root, snaps).filter((i) => i.kind === 'discovery').length, 0);
});

test('an approved skip request is recorded here with who, when and the request’s hash, and opens the gate', async () => {
  const t = await trail(true);
  const env = { root: t.root, adapter: t.adapter, journal: journalFile(t.root) };
  const r = await proposeReroute(env, {
    mapId: t.mapId,
    kind: 'reroute',
    lane: 'setting',
    reason: 'Skip discovery',
    evidence: 'One file',
    invalidates: [],
    changes: [{ op: 'skip_discovery' }],
    by: 'claude-01',
  });
  const hash = rerouteHash(r.proposal);
  await approveReroute(env, { mapId: t.mapId, id: r.proposal.id, by: 'trail lead', hash });
  const rec = trustLedger(t.root).get(trustKey.discoverySkipped(t.mapId))!;
  assert.equal(rec.by, 'trail lead');
  assert.equal(rec.hash, hash);
  assert.ok(rec.at > 0);
  assert.equal(requiresDiscovery(t.root, t.mapId), false);
});

test('first run: a trail adopted in bulk only when its map is committed and no brief ever was', async () => {
  const git = (cwd: string, ...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd });
  const plain = await trail(false);
  git(plain.repo, 'init', '-q');
  git(plain.repo, 'add', '.');
  git(plain.repo, 'commit', '-qm', 'trail');
  const snaps = [await plain.adapter.loadMap(plain.mapId)];
  const [ok] = (await withCommitted(plain.root, pendingTrust(plain.root, snaps))).filter((i) => i.kind === 'discovery');
  assert.equal(ok.committed, true, 'charted without discovery, committed: may come along');

  const gated = await trail(true);
  git(gated.repo, 'init', '-q');
  git(gated.repo, 'add', '.');
  git(gated.repo, 'commit', '-qm', 'trail');
  rmSync(briefPath(gated.root, gated.mapId));
  const later = [await gated.adapter.loadMap(gated.mapId)];
  const [rm] = (await withCommitted(gated.root, pendingTrust(gated.root, later))).filter((i) => i.kind === 'discovery');
  assert.equal(rm.committed, false, 'a committed brief deleted since: its own look, never a bulk adoption');
  const bulk = approveTrust({
    root: gated.root,
    items: [
      { key: rm.key, hash: rm.hash },
      { key: 'x', hash: 'y' },
    ],
    by: 'trail lead',
    snaps: later,
  });
  assert.deepEqual(bulk.refused, [rm.key]);
  assert.equal(requiresDiscovery(gated.root, gated.mapId), true);
});
