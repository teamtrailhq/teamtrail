import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { chartMap } from '../src/planning/operations/chart';
import { outsideChanges } from '../src/signedState/outsideChanges';

/*
 * A new trail's folder is named from its title, and never one that is already there: two trails with the same
 * title (or titles that slug the same) each get their own, even when two processes create them at once.
 */

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

const adapterOf = (root: string, by = 'agent claude-01') =>
  new MarkdownAdapter({ ...nodeMarkdownFs(root, { by }), watch: undefined }, root);

/** A process of its own creating trails at the same time as others. */
if (process.env.TRAIL_FOLDER_WORKER) {
  const [root, who] = process.env.TRAIL_FOLDER_WORKER.split('|');
  const adapter = adapterOf(root, who);
  for (let i = 0; i < 3; i++) await adapter.createMap({ title: 'Sync', sections: { ...SECTIONS, destination: who } });
  process.exit(0);
}

const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-folders-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};

const chart = (root: string, title: string) =>
  chartMap(adapterOf(root), {
    title,
    sections: { ...SECTIONS, destination: title },
    tickets: [{ ref: 'a', title: `${title} work`, type: 'task', body: 'Do it.' }],
  });

test('a second trail with the same title gets a folder of its own; the first is untouched', async () => {
  const root = tmpRoot();
  const first = await chart(root, 'Sync');
  const before = readFileSync(path.join(root, 'sync/map.md'), 'utf8');
  const second = await chart(root, 'Sync');
  assert.equal(first.map.id, 'sync');
  assert.equal(second.map.id, 'sync-2');
  assert.equal(readFileSync(path.join(root, 'sync/map.md'), 'utf8'), before, 'the first map is not overwritten');
  const a = await adapterOf(root).loadMap('sync');
  const b = await adapterOf(root).loadMap('sync-2');
  assert.deepEqual(
    a.tickets.map((t) => t.title),
    ['Sync work'],
  );
  assert.deepEqual(
    b.tickets.map((t) => t.title),
    ['Sync work'],
  );
  assert.notEqual(a.tickets[0].id, b.tickets[0].id);
  assert.equal(outsideChanges(root).changes.length, 0);
});

test('titles that slug the same never share a folder', async () => {
  const root = tmpRoot();
  const ids = [];
  for (const title of ['Sync!', 'sync', ' SYNC ', 'sync-2']) ids.push((await chart(root, title)).map.id);
  assert.deepEqual(ids, ['sync', 'sync-2', 'sync-3', 'sync-2-2']);
  const titles = await Promise.all(ids.map(async (id) => (await adapterOf(root).loadMap(id)).map.title));
  assert.deepEqual(titles, ['Sync!', 'sync', ' SYNC ', 'sync-2']);
});

test('an archived trail, a folder with something in it and a trail removed outside Teamtrail keep their names', async () => {
  const root = tmpRoot();
  const adapter = adapterOf(root);
  await chart(root, 'Sync');
  await adapter.setMapArchived('sync', true);
  mkdirSync(path.join(root, 'stray'));
  writeFileSync(path.join(root, 'stray/notes.txt'), 'not a trail, but not empty');
  mkdirSync(path.join(root, 'empty/tickets'), { recursive: true });
  const gone = await chart(root, 'Gone');
  rmSync(path.join(root, gone.map.id), { recursive: true });
  assert.equal((await chart(root, 'Sync')).map.id, 'sync-2');
  assert.equal((await chart(root, 'Stray')).map.id, 'stray-2');
  assert.equal((await chart(root, 'Gone')).map.id, 'gone-2', 'a removed trail still waits on the human');
  assert.equal((await chart(root, 'Briefs')).map.id, 'briefs-2', 'never a folder of the tracker');
  assert.equal((await chart(root, 'Empty')).map.id, 'empty', 'an empty folder holds nothing to lose');
  assert.equal(existsSync(path.join(root, 'stray/map.md')), false);
  assert.equal((await adapter.loadMap('sync')).map.archived, true);
});

test('two processes creating trails with the same title at once never share a folder', async () => {
  const root = tmpRoot();
  const self = fileURLToPath(import.meta.url);
  const run = (who: string) =>
    new Promise<number>((resolve) => {
      const child = spawn(process.execPath, [self], {
        env: { ...process.env, TRAIL_FOLDER_WORKER: `${root}|${who}` },
        stdio: 'inherit',
      });
      child.on('exit', (code) => resolve(code ?? 1));
    });
  assert.deepEqual(await Promise.all(['a', 'b', 'c'].map(run)), [0, 0, 0]);
  const maps = await adapterOf(root).listMaps();
  assert.equal(maps.length, 9, 'every trail kept its own map');
  assert.equal(new Set(maps.map((m) => m.id)).size, 9);
  const writers = await Promise.all(
    maps.map(async (m) => (await adapterOf(root).loadMap(m.id)).map.sections.destination),
  );
  assert.deepEqual(writers.sort(), ['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'c']);
  assert.equal(outsideChanges(root).changes.length, 0, 'every map was signed by its writer');
});
