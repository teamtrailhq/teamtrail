import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseMapFile, serializeMapFile } from '../src/adapters/markdown/mapFile';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { ALL_LABELS } from '../src/adapters/remote/format';
import { mapFromIssue } from '../src/adapters/remote/issueMapping';
import { isQueuedWrite } from '../src/adapters/remote/sync/isQueuedWrite';
import { applyWrite } from '../src/adapters/remote/sync/queuedWrites';
import { activeTrails } from '../src/model/activeTrails';
import { ARCHIVED_LABEL } from '../src/model/brand';
import type { MapDoc } from '../src/model/types';
import { setTrailArchived } from '../src/planning/lifecycle/setTrailArchived';
import { chartMap } from '../src/planning/operations/chart';
import { claim, orderNext } from '../src/planning/operations/claims';
import { promoteToTicket } from '../src/planning/operations/scope';
import { outsideChanges } from '../src/signedState/outsideChanges';
import { changedKeys, mapFields } from '../src/signedState/stateFields';

/* Archiving a trail: the trail lead puts it away as history; no agent takes work from it until it is restored. */

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: ['Later'], outOfScope: [] };
const PLAN = {
  title: 'Trail',
  sections: SECTIONS,
  tickets: [{ ref: 'r', title: 'Look around', type: 'research' as const, body: 'Read the code.' }],
};

test('archived: only the trail lead archives; then no work is offered or taken, and restoring brings it back', async () => {
  const adapter = new MemoryAdapter();
  const { map, tickets } = await chartMap(adapter, PLAN);
  await assert.rejects(setTrailArchived(adapter, map.id, true, 'agent'), /only the trail lead/);
  await setTrailArchived(adapter, map.id, true, 'trail lead');
  const listed = await adapter.listMaps();
  assert.equal(listed[0].archived, true);
  assert.deepEqual(activeTrails(listed), []);
  assert.deepEqual(orderNext(await adapter.loadMap(map.id)), []);
  await assert.rejects(claim(adapter, map.id, tickets[0].id, { assignee: 'claude-01' }), /archived/);
  await assert.rejects(promoteToTicket(adapter, map.id, 'Later', { type: 'task' }), /archived/);
  await setTrailArchived(adapter, map.id, false, 'trail lead');
  assert.equal((await adapter.listMaps())[0].archived, undefined);
  assert.equal((await claim(adapter, map.id, tickets[0].id, { assignee: 'claude-01' })).assignee, 'claude-01');
});

test('archived: map.md keeps it in frontmatter, and an active trail writes nothing new', () => {
  const m: MapDoc = {
    id: 't',
    key: '#1',
    title: 'T',
    mode: 'plan+execute',
    sections: SECTIONS,
    createdAt: 0,
    updatedAt: 0,
  };
  assert.doesNotMatch(serializeMapFile(m), /archived/);
  const text = serializeMapFile({ ...m, archived: true });
  assert.match(text, /^archived: "?true"?$/m);
  assert.equal(parseMapFile('t', text).archived, true);
});

test('archived: GitHub and Linear read it from the trail issue label, which Teamtrail creates with the others', () => {
  const issue = (labels: string[]) =>
    mapFromIssue({
      id: '1',
      key: '#1',
      title: 'T',
      labels,
      body: '## Destination\n\nD',
      writer: { kind: 'self', name: 'octo-dev' } as const,
      createdAt: '',
      updatedAt: '',
    });
  assert.equal(issue([ARCHIVED_LABEL]).archived, true);
  assert.equal(issue([]).archived, undefined);
  assert.ok(ALL_LABELS.some((l) => l.name === ARCHIVED_LABEL));
});

test('archived: a queued archive survives a restart and applies to the cached trail', () => {
  const w = { id: 'w1', mapId: 't', label: 'archive trail', at: 1, change: { kind: 'archived', archived: true } };
  assert.ok(isQueuedWrite(w));
  assert.ok(!isQueuedWrite({ ...w, change: { kind: 'archived', archived: 'yes' } }));
  const m: MapDoc = {
    id: 't',
    key: '#1',
    title: 'T',
    mode: 'plan+execute',
    sections: SECTIONS,
    createdAt: 0,
    updatedAt: 0,
  };
  const e = { snap: { map: m, tickets: [] }, decisions: [], at: 0 };
  applyWrite(e, w as Parameters<typeof applyWrite>[1], () => 2);
  assert.equal(e.snap.map.archived, true);
});

test('archived: a signed record from before archiving existed still matches an active trail', () => {
  const m: MapDoc = {
    id: 't',
    key: '#1',
    title: 'T',
    mode: 'plan+execute',
    sections: SECTIONS,
    createdAt: 0,
    updatedAt: 0,
  };
  const { archived, ...older } = mapFields(m);
  assert.equal(archived, null);
  assert.deepEqual(changedKeys(older, mapFields(m)), []);
});

test('archived: restoring a trail by editing map.md does not count; the signed value holds and it is flagged', async () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-archive-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root, { by: 'lookout' }), watch: undefined }, root);
  const { map } = await chartMap(adapter, PLAN);
  await setTrailArchived(adapter, map.id, true, 'trail lead');
  const file = path.join(root, map.id, 'map.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^archived: .*\n/m, ''));
  assert.equal((await adapter.loadMap(map.id)).map.archived, true);
  const change = outsideChanges(root).changes.find((c) => c.kind === 'map' && c.mapId === map.id);
  assert.deepEqual(change?.fields, ['archived']);
});
