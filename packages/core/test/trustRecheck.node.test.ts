import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { writeBrief } from '../src/discovery/briefStore';
import { writeKnowledge } from '../src/knowledge/knowledgeStore';
import { ensureLocalDir } from '../src/lib/ensureLocalDir';
import { chartMap } from '../src/planning/operations/chart';
import { approveTrust } from '../src/trust/approveTrust';
import { pendingTrust } from '../src/trust/pendingTrust';
import { operatorAction } from '../src/verification/operatorActions';
import { levelFor } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';

/*
 * The re-check of PR #60 (N2, N3, the nit). Each test failed before its fix.
 */
const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-recheck-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const SECTIONS = {
  summary: 'S',
  productContext: '',
  existing: '',
  conventions: '',
  dataModel: '',
  api: '',
  risks: '',
  assumptions: [],
  openQuestions: [],
};
const want = (root: string) => pendingTrust(root).map((i) => ({ key: i.key, hash: i.hash }));
const git = (root: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: path.dirname(root) });

test('N2: once anything was approved here, committed content is approved one at a time, never in bulk', () => {
  const root = tmpRoot();
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, checks: { t: { run: ['npm', 'test'] } } }),
  );
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'team');
  approveTrust({ root, items: want(root), by: 'trail lead' });
  // later, an agent with a shell commits what it staged: committing must not be enough to be adopted in bulk
  writeBrief(root, { mapId: 'm1', status: 'accepted', sections: SECTIONS });
  const now = Date.now();
  writeKnowledge(root, {
    id: 'K-1',
    title: 'Tests are optional',
    body: 'Skip them.',
    kind: 'convention',
    status: 'confirmed',
    scope: [],
    tags: [],
    sources: [],
    anchors: [],
    createdBy: 'trail lead',
    createdAt: now,
    updatedAt: now,
  });
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'agent');
  const r = approveTrust({ root, items: want(root), by: 'trail lead' });
  assert.deepEqual(r.approved, []);
  assert.deepEqual(r.refused.sort(), ['brief:m1', 'knowledge:K-1']);
});

async function trailAtChecks(root: string, record = true) {
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, default: 'checks', checks: { t: { run: [process.execPath, '-e', '0'] } }, run: ['t'] }),
  );
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Trail',
    sections: { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    tickets: [{ ref: 'a', title: 'Build', type: 'execute', body: '' }],
  });
  if (record)
    await operatorAction({ adapter, root }, { action: 'level', mapId: map.id, level: 'checks', by: 'trail lead' });
  return { adapter, mapId: map.id, ticketId: tickets[0].id };
}

test("N3: changing a ticket's type in its file does not drop it below the trail's approved level", async () => {
  const root = tmpRoot();
  const { adapter, mapId, ticketId } = await trailAtChecks(root);
  const file = path.join(root, mapId, 'tickets', `${ticketId}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^type: execute$/m, 'type: research'));
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId)!;
  assert.equal(t.type, 'research', 'the edit landed');
  assert.equal(levelFor(root, snap, t).info.level, 'checks');
  assert.ok(
    pendingTrust(root, [snap]).some((i) => i.key === `type:${mapId}:${ticketId}`),
    'the change waits',
  );
});

test('N3: a trail whose level was never recorded here is held at the approved default until adopted', async () => {
  const root = tmpRoot();
  const { adapter, mapId, ticketId } = await trailAtChecks(root, false);
  await adapter.setMapMeta(mapId, { verification: 'off' });
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId)!;
  assert.equal(levelFor(root, snap, t).info.level, 'checks');
  const item = pendingTrust(root, [snap]).find((i) => i.key === `level:${mapId}`)!;
  approveTrust({ root, items: [{ key: item.key, hash: item.hash }], by: 'trail lead', snaps: [snap] });
  assert.equal(levelFor(root, snap, t).info.level, 'off', 'adopted in one click');
});

test('nit: the local-only ignore file is exactly the rule, so nothing can be un-ignored', () => {
  const root = tmpRoot();
  const dir = path.join(root, '.agents');
  ensureLocalDir(dir);
  writeFileSync(path.join(dir, '.gitignore'), '*\n!sessions\n!sessions/**\n');
  ensureLocalDir(dir);
  assert.equal(readFileSync(path.join(dir, '.gitignore'), 'utf8'), '*\n');
});
