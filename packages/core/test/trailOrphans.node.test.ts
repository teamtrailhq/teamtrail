import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { journalFile } from '../src/history/journalFile';
import { chartMap } from '../src/planning/operations/chart';

/*
 * A trail folder deleted by hand before this machine signed anything leaves its local history behind: journal,
 * evidence, reroutes, leases. A new trail never takes that name, so it never inherits the history, which stays.
 */

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-orphans-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};

const chart = (root: string, title: string) =>
  chartMap(new MarkdownAdapter({ ...nodeMarkdownFs(root, { by: 'agent claude-01' }), watch: undefined }, root), {
    title,
    sections: { ...SECTIONS, destination: title },
    tickets: [{ ref: 'a', title: `${title} work`, type: 'task', body: 'Do it.' }],
  });

const put = (root: string, rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};

const OLD_ENTRY = JSON.stringify({
  kind: 'transition',
  mapId: 'sync',
  ticketId: '7',
  from: 'open',
  to: 'closed',
  at: 1,
});

/** Local-only state a trail named `sync` leaves behind, one kind at a time. */
const ORPHANS = [
  '.events/sync.jsonl',
  '.evidence/sync/7/attempts.json',
  '.reroutes/sync/R-1.json',
  '.agents/charted/sync.json',
  '.agents/criteria-proposals/sync.json',
  '.agents/leases/sync--7.json',
  '.agents/workspaces/sync--7.json',
  '.agents/runs/sync--7.json',
];

for (const rel of ORPHANS) {
  test(`a new trail never takes the name ${rel} is kept under, and leaves it as it was`, async () => {
    const root = tmpRoot();
    const text = rel.endsWith('.jsonl') ? `${OLD_ENTRY}\n` : '{"old":true}';
    put(root, rel, text);
    const created = await chart(root, 'Sync');
    assert.equal(created.map.id, 'sync-2');
    assert.equal(readFileSync(path.join(root, rel), 'utf8'), text, 'the history is neither moved nor deleted');
  });
}

test('the new trail’s journal is its own: the old one stays under the old name', async () => {
  const root = tmpRoot();
  put(root, '.events/sync.jsonl', `${OLD_ENTRY}\n`);
  const created = await chart(root, 'Sync');
  journalFile(root).append({ kind: 'transition', mapId: created.map.id, ticketId: '2', at: 2 } as never);
  const mine = readFileSync(path.join(root, `.events/${created.map.id}.jsonl`), 'utf8');
  assert.equal(mine.includes('"ticketId":"7"'), false);
  assert.equal(readFileSync(path.join(root, '.events/sync.jsonl'), 'utf8'), `${OLD_ENTRY}\n`);
});

test('empty folders, and another trail’s state with a name that starts the same, leave the name free', async () => {
  const root = tmpRoot();
  mkdirSync(path.join(root, '.evidence/sync'), { recursive: true });
  mkdirSync(path.join(root, '.reroutes/sync'), { recursive: true });
  put(root, '.agents/leases/sync-2--1.json', '{}');
  put(root, '.events/sync-2.jsonl', '');
  assert.equal((await chart(root, 'Sync')).map.id, 'sync');
});
