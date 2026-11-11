import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge } from '../src/bridge';
import { writeCriteriaProposal } from '../src/criteria/criteriaProposals';
import { writeTicketCriteria } from '../src/criteria/criteriaStore';
import { writeBrief } from '../src/discovery/briefStore';
import { journalFile } from '../src/history/journalFile';
import { writeKnowledge } from '../src/knowledge/knowledgeStore';
import { chartMap } from '../src/planning/operations/chart';
import { proposeReroute } from '../src/planning/reroute/rerouteFlow';
import { readReroute, writeReroute } from '../src/planning/reroute/rerouteStore';

/*
 * One definition of "the hash of what the page showed" for every single-item approval route (N4): what each GET
 * serves is what its POST accepts, and a file changed in between is refused with 409, nothing approved.
 */
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
const now = Date.now();
const entry = (body: string) => ({
  id: 'K-1',
  title: 'Notify through NotifyService',
  body,
  kind: 'convention' as const,
  status: 'suggested' as const,
  scope: [],
  tags: [],
  sources: [],
  anchors: [],
  createdBy: 'claude-01',
  createdAt: now,
  updatedAt: now,
});
const criteria = (text: string) => [{ id: 'AC-1', text, kind: 'unit' as const }];

async function project() {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-shown-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Trail',
    sections: { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    tickets: [
      { ref: 'a', title: 'Build', type: 'execute', body: '' },
      { ref: 'b', title: 'Old spike', type: 'research', body: '' },
    ],
  });
  const bridge = createTrackerBridge(root, { env: {}, leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const get = async (p: string) => (await (await fetch(base + p)).json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const post = async (p: string, body: unknown) =>
    (
      await fetch(base + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).status;
  const close = () => new Promise((r) => (server.closeAllConnections(), server.close(r), bridge.close?.()));
  return { root, adapter, mapId: map.id, a: tickets[0], b: tickets[1], get, post, close };
}

test('/briefs/accept takes the hash GET /briefs served, and refuses a brief changed since', async () => {
  const p = await project();
  try {
    writeBrief(p.root, { mapId: p.mapId, status: 'submitted', sections: SECTIONS });
    const old = (await p.get(`/briefs?mapId=${p.mapId}`)).hash;
    writeBrief(p.root, { mapId: p.mapId, status: 'submitted', sections: { ...SECTIONS, summary: 'Changed' } });
    assert.equal(await p.post('/briefs/accept', { mapId: p.mapId, hash: old }), 409);
    const shown = (await p.get(`/briefs?mapId=${p.mapId}`)).hash;
    assert.equal(await p.post('/briefs/accept', { mapId: p.mapId, hash: shown }), 200);
  } finally {
    await p.close();
  }
});

test('/criteria/confirm takes the hash GET /criteria served, and refuses criteria changed since', async () => {
  const p = await project();
  try {
    const map = { id: p.mapId, title: 'Trail' };
    const t = { id: p.a.id, key: p.a.key };
    writeTicketCriteria(p.root, map, t, { criteria: criteria('Exports every row') });
    const old = (await p.get(`/criteria?mapId=${p.mapId}`)).tickets[0].hash;
    writeTicketCriteria(p.root, map, t, { criteria: criteria('Trivially true') });
    const body = { mapId: p.mapId, ticketId: t.id, ticketKey: t.key };
    assert.equal(await p.post('/criteria/confirm', { ...body, hash: old }), 409);
    const shown = (await p.get(`/criteria?mapId=${p.mapId}`)).tickets[0].hash;
    assert.equal(await p.post('/criteria/confirm', { ...body, hash: shown }), 200);
  } finally {
    await p.close();
  }
});

test('/criteria-proposals/accept takes the hash GET served, and refuses a proposal changed since', async () => {
  const p = await project();
  try {
    const proposal = (text: string, at: number) => ({
      ticketId: p.a.id,
      ticketKey: p.a.key,
      criteria: criteria(text),
      by: 'claude-01',
      at,
    });
    writeCriteriaProposal(p.root, p.mapId, proposal('Fewer rows', 1));
    const old = (await p.get(`/criteria-proposals?mapId=${p.mapId}`)).proposals[0].hash;
    writeCriteriaProposal(p.root, p.mapId, proposal('No rows at all', 2));
    const body = { mapId: p.mapId, ticketId: p.a.id, title: 'Trail' };
    assert.equal(await p.post('/criteria-proposals/accept', { ...body, hash: old }), 409);
    const shown = (await p.get(`/criteria-proposals?mapId=${p.mapId}`)).proposals[0].hash;
    assert.equal(await p.post('/criteria-proposals/accept', { ...body, hash: shown }), 200);
  } finally {
    await p.close();
  }
});

test('/knowledge/call takes the hash GET /knowledge served, and refuses an entry changed since', async () => {
  const p = await project();
  try {
    writeKnowledge(p.root, entry('Use src/notify/service.ts.'));
    const old = (await p.get('/knowledge')).hashes['K-1'];
    writeKnowledge(p.root, entry('Call providers directly.'));
    const call = { id: 'K-1', call: { kind: 'confirm' } };
    assert.equal(await p.post('/knowledge/call', { ...call, hash: old }), 409);
    const shown = (await p.get('/knowledge')).hashes['K-1'];
    assert.equal(await p.post('/knowledge/call', { ...call, hash: shown }), 200);
  } finally {
    await p.close();
  }
});

test('/reroutes/approve takes the hash GET served, and refuses a proposal changed since', async () => {
  const p = await project();
  try {
    const env = { root: p.root, adapter: p.adapter, journal: journalFile(p.root) };
    const { proposal } = await proposeReroute(env, {
      mapId: p.mapId,
      by: 'claude-01',
      kind: 'reroute',
      reason: 'the spike is obsolete',
      evidence: 'see the logs',
      invalidates: [],
      changes: [{ op: 'cancel_ticket', ticket: p.b.id, reason: 'obsolete' }],
    });
    const old = (await p.get(`/reroutes/${proposal.id}?map=${p.mapId}`)).reroute.hash;
    const file = readReroute(p.root, p.mapId, proposal.id)!;
    writeReroute(p.root, { ...file, reason: 'changed while you read it' });
    assert.equal(await p.post('/reroutes/approve', { mapId: p.mapId, id: proposal.id, hash: old }), 409);
    const shown = (await p.get(`/reroutes/${proposal.id}?map=${p.mapId}`)).reroute.hash;
    assert.equal(await p.post('/reroutes/approve', { mapId: p.mapId, id: proposal.id, hash: shown }), 200);
  } finally {
    await p.close();
  }
});
