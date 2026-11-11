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

/** A repo whose tracker folder is committed, and a git helper for it. */
async function committed(withBrief: boolean) {
  const t = await trail(withBrief);
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: t.repo, stdio: 'pipe' });
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'trail');
  return { ...t, git };
}

/** The first run's "approve all": every pending item, as the page would send them together. */
async function approveAll(t: { root: string; adapter: MarkdownAdapter; mapId: string }) {
  const snaps = [await t.adapter.loadMap(t.mapId)];
  const items = await withCommitted(t.root, pendingTrust(t.root, snaps));
  const discovery = items.find((i) => i.kind === 'discovery')!;
  const others = [{ key: 'checks', hash: 'not-shown' }];
  const bulk = approveTrust({
    root: t.root,
    items: [{ key: discovery.key, hash: discovery.hash }, ...others],
    by: 'trail lead',
    snaps,
    committed: new Set(items.flatMap((i) => (i.file ? [i.file] : []))),
  });
  return { discovery, bulk, snaps };
}

test('first run, the attack: git rm of a committed brief and a commit; the trail is never adopted in bulk', async () => {
  const t = await committed(true);
  t.git('rm', '-q', path.relative(t.repo, briefPath(t.root, t.mapId)));
  t.git('commit', '-qm', 'no brief');
  const { discovery, bulk } = await approveAll(t);
  assert.equal(discovery.alone, true);
  assert.deepEqual(bulk.refused, [discovery.key]);
  assert.equal(requiresDiscovery(t.root, t.mapId), true);
});

test('first run, the attack: an agent commits a trail folder of its own with no brief; never adopted in bulk', async () => {
  const t = await committed(false);
  const { discovery, bulk } = await approveAll(t);
  assert.deepEqual(bulk.refused, [discovery.key]);
  assert.equal(requiresDiscovery(t.root, t.mapId), true);
});

test('an explicit approval of that one item adopts the trail as running without discovery', async () => {
  const t = await committed(false);
  const { discovery, snaps } = await approveAll(t);
  const one = approveTrust({
    root: t.root,
    items: [{ key: discovery.key, hash: discovery.hash }],
    by: 'trail lead',
    snaps,
  });
  assert.deepEqual(one.approved, [discovery.key]);
  assert.equal(requiresDiscovery(t.root, t.mapId), false);
});
