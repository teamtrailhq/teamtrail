import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { parseTicket, serializeTicket } from '../src/adapters/markdown/ticketFile';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { joinBody, splitBody, ticketFromIssue, ticketMeta } from '../src/adapters/remote/format';
import type { Ticket } from '../src/model/types';
import { markSetupTicket } from '../src/planning/lifecycle/markSetupTicket';
import { chartMap } from '../src/planning/operations/chart';
import { withTicketFields } from '../src/signedState/applyFields';
import { unsignedTicket } from '../src/signedState/judgeItem';
import { outsideChanges } from '../src/signedState/outsideChanges';
import { changedKeys, ticketFields } from '../src/signedState/stateFields';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const PLAN = {
  title: 'New app',
  sections: SECTIONS,
  tickets: [
    { ref: 's', title: 'Set up the project', type: 'task' as const, body: 'Skeleton and a test.' },
    { ref: 'f', title: 'First feature', type: 'task' as const, body: 'Build it.' },
  ],
};

const base: Ticket = {
  id: '4',
  key: '#4',
  title: 'Set up the project',
  type: 'task',
  body: 'Skeleton.',
  state: 'open',
  blockedBy: [],
  comments: [],
  createdAt: 0,
  updatedAt: 0,
};

test('setup: the ticket file keeps it in frontmatter, and a ticket without it writes nothing new', () => {
  const md = serializeTicket({ ...base, setup: true });
  assert.match(md, /^setup: "true"$/m);
  assert.equal(parseTicket(md).setup, true);
  assert.doesNotMatch(serializeTicket(base), /setup/);
  assert.equal(parseTicket(serializeTicket(base)).setup, undefined);
});

test('setup: a signed field; older records without it read the same; a copied-in ticket never has it', () => {
  const fields = ticketFields({ ...base, setup: true });
  assert.equal(fields.setup, true);
  const { setup, ...older } = ticketFields(base);
  assert.equal(setup, null);
  assert.deepEqual(changedKeys(older, ticketFields(base)), []);
  assert.equal(withTicketFields(base, fields).setup, true);
  assert.equal(withTicketFields({ ...base, setup: true }, { setup: null }).setup, undefined);
  assert.equal(unsignedTicket(fields).setup, null);
});

test("setup: GitHub and Linear keep it in the ticket's meta marker", () => {
  const body = joinBody('Skeleton.', ticketMeta({ ...base, setup: true }));
  assert.equal(splitBody(body).meta.setup, true);
  const parts = {
    id: '4',
    key: '#4',
    title: 'Set up the project',
    labels: ['teamtrail:task'],
    writer: { kind: 'self' as const, name: 'octo' },
    closed: false,
    blockedBy: [],
    comments: [],
    createdAt: '2026-11-22T00:00:00Z',
    updatedAt: '2026-11-22T00:00:00Z',
  };
  assert.equal(ticketFromIssue({ ...parts, body }).setup, true);
  assert.equal(ticketFromIssue({ ...parts, body: joinBody('x', { setup: 'yes' } as never) }).setup, undefined);
  assert.equal(ticketFromIssue({ ...parts, writer: { kind: 'outsider', name: 'eve' }, body }).setup, undefined);
});

test('setup: marking writes the field and journals who marked it', async () => {
  const root = tempFolder('tt-setup-mark-');
  const adapter = new MemoryAdapter();
  const { map, tickets } = await chartMap(adapter, PLAN);
  await markSetupTicket({ adapter, root, mapId: map.id, ticketId: tickets[0].id, by: 'claude-01' });
  const snap = await adapter.loadMap(map.id);
  assert.equal(snap.tickets.find((t) => t.id === tickets[0].id)?.setup, true);
  const raw = readFileSync(path.join(root, '.events', `${map.id}.jsonl`), 'utf8');
  assert.match(raw, /"kind":"setup-ticket"/);
  assert.match(raw, /"actor":"claude-01"/);
});

test('setup: added by editing the ticket file, it counts only once the trail lead accepts it', async () => {
  const root = path.join(tempFolder('tt-setup-signed-'), '.teamtrail');
  mkdirSync(root, { recursive: true });
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root, { by: 'lookout' }), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, PLAN);
  const file = path.join(root, map.id, 'tickets', `${tickets[1].id}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^state: /m, 'setup: true\nstate: '));
  const read = (await adapter.loadMap(map.id)).tickets.find((t) => t.id === tickets[1].id);
  assert.equal(read?.setup, undefined, 'the signed value holds');
  const change = outsideChanges(root).changes.find((c) => c.kind === 'ticket' && c.id === tickets[1].id);
  assert.ok(change?.fields.includes('setup'));
});
