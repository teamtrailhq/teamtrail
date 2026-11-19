import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge } from '../src/bridge';
import { readCriteria, writeTicketCriteria } from '../src/criteria/criteriaStore';
import { readBrief, writeBrief } from '../src/discovery/briefStore';
import { journalFile } from '../src/history/journalFile';
import { TRUST_JOURNAL } from '../src/model/lifecycle';
import { chartMap } from '../src/planning/operations/chart';
import { trustKey, trustLedger } from '../src/trust/trustLedger';
import { tempFolder } from './tempFolder';

/*
 * Approve the plan: the brief and every ticket's criteria in one step, each bound to the hash of what the page showed,
 * all or nothing, each item recorded on this machine and journaled under `_trust`.
 */
const SECTIONS = {
  summary: 'Offline sync',
  productContext: '',
  existing: '',
  conventions: '',
  dataModel: '',
  api: '',
  risks: '',
  assumptions: [],
  openQuestions: [],
};
const criteria = (text: string) => [{ id: 'AC-1', text, kind: 'unit' as const }];

async function project() {
  const root = path.join(tempFolder('teamtrail-plan-'), '.teamtrail');
  mkdirSync(root, { recursive: true });
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Trail',
    sections: { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    tickets: [
      { ref: 'a', title: 'Build', type: 'execute', body: '' },
      { ref: 'b', title: 'Wire', type: 'task', body: '' },
    ],
  });
  const bridge = createTrackerBridge(root, { env: {}, leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = async (p: string) => (await (await fetch(base + p)).json()) as Record<string, any>;
  const post = async (p: string, body: unknown) => {
    const r = await fetch(base + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  const close = () => new Promise((r) => (server.closeAllConnections(), server.close(r), bridge.close?.()));
  const map_ = { id: map.id, title: 'Trail' };
  writeBrief(root, { mapId: map.id, status: 'submitted', sections: SECTIONS });
  writeTicketCriteria(root, map_, { id: tickets[0].id, key: tickets[0].key }, { criteria: criteria('Syncs') });
  writeTicketCriteria(root, map_, { id: tickets[1].id, key: tickets[1].key }, { criteria: criteria('Merges') });
  /** The plan as the page shows it now. */
  const shown = async () => {
    const brief = (await get(`/briefs?mapId=${map.id}`)).hash as string;
    const listed = (await get(`/criteria?mapId=${map.id}`)).tickets as { ticketId: string; ticketKey: string }[];
    const keyOf = (id: string) => tickets.find((t) => t.id === id)!.key;
    const items = listed.map((t) => ({ ...t, ticketKey: keyOf(t.ticketId) }));
    return { mapId: map.id, title: 'Trail', brief, criteria: items };
  };
  return { root, mapId: map.id, map: map_, tickets, shown, post, close };
}

test('approving the plan accepts the brief and confirms every ticket shown, each recorded and journaled', async () => {
  const p = await project();
  try {
    const plan = await p.shown();
    const r = await p.post('/plan/approve', plan);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(readBrief(p.root, p.mapId)?.status, 'accepted');
    assert.ok(readCriteria(p.root, p.mapId).every((t) => t.confirmed));
    const ledger = trustLedger(p.root);
    assert.ok(ledger.get(trustKey.brief(p.mapId)));
    for (const t of p.tickets) assert.ok(ledger.get(trustKey.criteria(p.mapId, t.id)));
    const lines = journalFile(p.root)
      .readTrust(TRUST_JOURNAL)
      .map((e) => e.subject);
    assert.equal(lines.length, 3);
    assert.ok(lines[0].startsWith('brief of trail'));
  } finally {
    await p.close();
  }
});

test('criteria changed since they were shown approve nothing, the brief included', async () => {
  const p = await project();
  try {
    const plan = await p.shown();
    writeTicketCriteria(p.root, p.map, { id: p.tickets[1].id, key: p.tickets[1].key }, { criteria: criteria('Any') });
    const r = await p.post('/plan/approve', plan);
    assert.equal(r.status, 409);
    assert.match(String(r.body.error), /changed since you opened it/);
    assert.equal(readBrief(p.root, p.mapId)?.status, 'submitted');
    assert.ok(readCriteria(p.root, p.mapId).every((t) => !t.confirmed));
    assert.equal(trustLedger(p.root).get(trustKey.brief(p.mapId)), undefined);
  } finally {
    await p.close();
  }
});

test('a brief changed since, a missing hash or a malformed plan approve nothing', async () => {
  const p = await project();
  try {
    const plan = await p.shown();
    writeBrief(p.root, { mapId: p.mapId, status: 'submitted', sections: { ...SECTIONS, summary: 'Other' } });
    assert.equal((await p.post('/plan/approve', plan)).status, 409);
    assert.equal((await p.post('/plan/approve', { ...plan, brief: '' })).status, 400);
    const twice = { ...plan, criteria: [plan.criteria[0], plan.criteria[0]] };
    assert.equal((await p.post('/plan/approve', { ...twice, brief: (await p.shown()).brief })).status, 400);
    assert.equal(readBrief(p.root, p.mapId)?.status, 'submitted');
  } finally {
    await p.close();
  }
});

test('a brief no longer submitted is refused', async () => {
  const p = await project();
  try {
    writeBrief(p.root, { mapId: p.mapId, status: 'changes-requested', note: 'More', sections: SECTIONS });
    const r = await p.post('/plan/approve', await p.shown());
    assert.equal(r.status, 409);
    assert.match(String(r.body.error), /not submitted/);
  } finally {
    await p.close();
  }
});
