import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { chartMap } from '../src/planning/operations/chart';
import { claim } from '../src/planning/operations/claims';
import { stateRecordFile } from '../src/signedState/stateRecord';

/*
 * A Teamtrail write renames the tracker file in, then signs it in the trail's record, both under the record's lock.
 * Another process reading in between (the Lookout, after the file changed) must not take that write for a change
 * made outside Teamtrail: nothing tells it to read again once the record lands.
 */

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

async function trail() {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-window-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root, { by: 'agent claude-01' }), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Trail',
    sections: SECTIONS,
    tickets: [{ ref: 'x', title: 'Build it', type: 'execute', body: 'Do it.' }],
  });
  return { root, adapter, mapId: map.id, id: tickets[0].id };
}

test('a read while a Teamtrail write is between its file and its record waits for the record', async () => {
  const { root, adapter, mapId, id } = await trail();
  const record = stateRecordFile(root, mapId);
  const before = readFileSync(record, 'utf8');
  await claim(adapter, mapId, id, { assignee: 'claude-01' });
  const after = readFileSync(record, 'utf8');
  // the moment between the two steps of that claim: its file is in, its record not yet, the writer holds the lock
  writeFileSync(record, before);
  writeFileSync(`${record}.lock`, String(process.pid));
  const reader = new MarkdownAdapter({ ...nodeMarkdownFs(root, { by: 'lookout' }), watch: undefined }, root);
  const read = reader.loadMap(mapId);
  setTimeout(() => {
    writeFileSync(record, after);
    rmSync(`${record}.lock`);
  }, 100);
  const t = (await read).tickets.find((x) => x.id === id)!;
  assert.equal(t.assignee, 'claude-01', 'the claim as Teamtrail wrote it, not the signed value from before it');
  assert.notEqual(t.status, 'blocked', 'not held as a change made outside Teamtrail');
});

test('an edit made outside Teamtrail still reads as one, with no write in progress', async () => {
  const { root, adapter, mapId, id } = await trail();
  const file = path.join(root, mapId, 'tickets', `${id}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^state: open$/m, 'state: closed'));
  const t = (await adapter.loadMap(mapId)).tickets.find((x) => x.id === id)!;
  assert.equal(t.state, 'open');
  assert.equal(t.status, 'blocked');
});
