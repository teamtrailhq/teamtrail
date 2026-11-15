import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { journalFile, journalPath } from '../src/history/journalFile';
import { PROOF_POST_JOURNAL } from '../src/model/proofPost';
import { chartMap } from '../src/planning/operations/chart';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';

let server: http.Server;
let bridge: TrackerBridge;
let base: string;
let root: string;
let ids: { mapId: string; ticketId: string };

before(async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-proofroutes-'));
  root = path.join(tmp, '.teamtrail');
  mkdirSync(root);
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const sections = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
  const { map, tickets } = await chartMap(a, {
    title: 'Checkout',
    sections,
    tickets: [{ ref: 'a', title: 'Free shipping', type: 'execute', body: '' }],
  });
  ids = { mapId: map.id, ticketId: tickets[0].id };
  bridge = createTrackerBridge(root, { env: {}, configDir: path.join(tmp, 'config'), cwd: tmp });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  bridge.close();
  server.close();
});

const call = async <T>(method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as T };
};

test('posting proofs is off until the trail lead switches it on here; the switch is journaled', async () => {
  assert.deepEqual((await call('GET', '/proof/settings')).json, { enabled: false });
  assert.equal((await call('PUT', '/proof/settings', { enabled: 'yes' })).status, 400);
  assert.deepEqual((await call('PUT', '/proof/settings', { enabled: true })).json, { enabled: true });
  assert.deepEqual((await call('PUT', '/proof/settings', { enabled: true })).json, { enabled: true });
  await call('PUT', '/proof/settings', { enabled: false });
  // an older version's entries and a kind from a newer one sit in the same file
  appendFileSync(journalPath(root, PROOF_POST_JOURNAL), '{"v":1,"kind":"from-the-future","at":1,"mapId":"_proof"}\n');
  const j = journalFile(root);
  assert.deepEqual(
    j.readProofPost(PROOF_POST_JOURNAL).map((e) => e.action),
    ['on', 'off'],
  );
  assert.deepEqual(j.readAll(PROOF_POST_JOURNAL), []);
  assert.equal(thisMachineOnly('PUT', '/proof/settings'), true);
  assert.equal(thisMachineOnly('GET', '/proof/settings'), false);
  assert.equal(thisMachineOnly('GET', '/proof/ticket'), false);
});

test("GET /proof/ticket gives a ticket's proof and its Markdown", async () => {
  const r = await call<{ proof: { status: string; gaps: string[] }; markdown: string }>(
    'GET',
    `/proof/ticket?mapId=${ids.mapId}&ticketId=${ids.ticketId}`,
  );
  assert.equal(r.status, 200);
  assert.equal(r.json.proof.status, 'not-verified');
  assert.deepEqual(r.json.proof.gaps, ['No completion was submitted for this ticket.']);
  assert.match(r.json.markdown, /not-verified\.svg/);
  assert.equal((await call('GET', `/proof/ticket?mapId=${ids.mapId}&ticketId=nope`)).status, 404);
  assert.equal((await call('GET', '/proof/ticket')).status, 400);
});
