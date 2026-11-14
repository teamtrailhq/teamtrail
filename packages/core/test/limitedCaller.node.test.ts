/**
 * An embedding server's sign-in may deny a caller high-risk calls (`ExternalCaller.highRisk: false`). What that
 * caller does in the Lookout then counts at every gate but the high-risk ones, as a Slack answer does: its answers
 * are `lookout-limited`, and it can't answer a high-risk question, accept high-risk work, record a decision on a
 * high-risk ticket (nor supersede one naming another ticket), approve a reroute, or close a high-risk ticket through
 * the file route. It is also another device's whatever its kind: it can't change the risk policy or approve what
 * this machine trusts. A caller with `highRisk: true` or unset can do all of it, as before.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { checkAgentAnswer } from '../src/agents/agentAnswerSignature';
import { agentPaths, type AgentSessionDoc } from '../src/agents/agentLink';
import {
  createProjectsHub,
  createTrackerBridge,
  type ExternalSignIn,
  type ProjectsHub,
  type TrackerBridge,
} from '../src/bridge';
import { journalFile } from '../src/history/journalFile';
import { writeLocalJson } from '../src/lib/ensureLocalDir';
import { approvesGates, approvesHighRisk } from '../src/model/answerVia';
import type { Ticket } from '../src/model/types';
import { chartMap } from '../src/planning/operations/chart';
import { proposeReroute } from '../src/planning/reroute/rerouteFlow';
import { sendJson } from '../src/server/http';

type Who = 'limited' | 'allowed' | 'unsaid' | 'limited-device';

// `x-test-caller` stands in for whatever the embedding server verifies; `highRisk` follows from who it names.
const callers = new WeakMap<http.IncomingMessage, string>();
const external: ExternalSignIn = {
  admit(req, res) {
    const who = req.headers['x-test-caller'] as Who | undefined;
    if (!who) return void sendJson(res, 401, { error: 'sign in first' });
    const kind = who === 'limited-device' ? 'device' : 'machine';
    callers.set(req, kind);
    if (who === 'unsaid') return { id: 'p-unsaid', kind };
    return { id: `p-${who}`, kind, highRisk: who === 'allowed' };
  },
};
const peer = (req: http.IncomingMessage) => (callers.get(req) === 'machine' ? '127.0.0.1' : 'proxied');
const HOST = 'ws-1.example.test';
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

let top: string;
let root: string;
let bridge: TrackerBridge;
let hub: ProjectsHub;
let server: http.Server;
let port: number;
let mapId: string;
let tickets: Record<'risky' | 'plain' | 'risky2' | 'plain2', Ticket>;

/** An agent's session waiting on questions: q1 about the risky tickets (high risk), q2 about the plain one. */
function asked() {
  const q = (id: string, ticketId: string, category?: 'schema') => ({
    id,
    sessionId: 's1',
    mapId,
    ticketId,
    agent: 'claude-01',
    text: `Question ${id}?`,
    at: Date.now(),
    ...(category ? { category } : {}),
  });
  const doc = {
    v: 1,
    session: {
      id: 's1',
      agent: 'claude-01',
      mode: 'work',
      mapId,
      step: 1,
      total: 1,
      stepLabel: 'Ask',
      status: 'running',
      startedAt: Date.now(),
    },
    chats: [],
    pending: [
      q('q1', tickets.risky.id, 'schema'),
      q('q3', tickets.risky2.id, 'schema'),
      q('q2', tickets.plain.id),
      q('q4', tickets.plain2.id),
    ],
    answered: [],
    feed: [],
    pid: process.pid,
    updatedAt: Date.now(),
  } as AgentSessionDoc;
  writeLocalJson(root, agentPaths.session('s1'), doc);
}

before(async () => {
  top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-limited-'));
  root = path.join(top, 'repo', '.teamtrail');
  const configDir = path.join(top, 'config');
  mkdirSync(root, { recursive: true });
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root, { by: 'lookout' }), watch: undefined }, root);
  const charted = await chartMap(adapter, {
    title: 'Users',
    sections: SECTIONS,
    tickets: [
      { ref: 'drop', title: 'Drop the old table?', type: 'junction', body: '' },
      { ref: 'copy', title: 'Button copy', type: 'junction', body: '' },
      { ref: 'drop2', title: 'Drop the other table?', type: 'junction', body: '' },
      { ref: 'copy2', title: 'Footer copy', type: 'junction', body: '' },
    ],
  });
  mapId = charted.map.id;
  const [risky, plain, risky2, plain2] = charted.tickets;
  tickets = { risky, plain, risky2, plain2 };
  asked();
  const options = { env: {}, configDir, peer, allowedHosts: [HOST], streamKey: () => 'one person' };
  bridge = createTrackerBridge(root, { ...options, cwd: path.dirname(root) });
  hub = createProjectsHub({
    home: bridge,
    openBridge: (p) => createTrackerBridge(p.root, options),
    configDir,
    peer,
    allowedHosts: [HOST],
    external,
  });
  server = http.createServer((req, res) => void hub.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});

after(() => {
  hub.close();
  bridge.close();
  server.closeAllConnections();
  server.close();
});

interface Reply {
  status: number;
  text: string;
  etag?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>;
}

function call(who: Who, o: { path: string; method?: string; body?: unknown; headers?: Record<string, string> }) {
  const text = o.body === undefined ? undefined : typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
  return new Promise<Reply>((resolve, reject) => {
    const headers = { Host: HOST, 'x-test-caller': who, 'Content-Type': 'application/json', ...o.headers };
    const req = http.request({ host: '127.0.0.1', port, path: o.path, method: o.method ?? 'GET', headers }, (res) => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (out += c));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          text: out,
          etag: res.headers.etag,
          body: out.startsWith('{') ? JSON.parse(out) : {},
        }),
      );
    });
    req.on('error', reject);
    req.end(text);
  });
}

const answer = (who: Who, questionId: string) =>
  call(who, { path: '/agents/answer', method: 'POST', body: { sessionId: 's1', questionId, text: 'Yes' } });

const decision = (who: Who, t: Ticket) =>
  call(who, {
    path: '/decisions',
    method: 'POST',
    body: {
      trail: mapId,
      ticketId: t.id,
      ticketKey: t.key,
      question: t.title,
      answer: 'Yes',
      decidedBy: 'trail lead',
      source: { kind: 'lookout', label: 'Logbook' },
      appendToTrail: false,
    },
  });

/** Closes a ticket the way the Lookout does on a markdown tracker: writes its file back closed. */
async function closeByFile(who: Who, t: Ticket) {
  const rel = `${mapId}/tickets/${t.id}.md`;
  const loaded = await call(who, { path: `/file?path=${encodeURIComponent(rel)}` });
  assert.equal(loaded.status, 200);
  assert.match(loaded.text, /state: open/);
  const closed = loaded.text.replace(/state: open/, 'state: closed\nclose_reason: completed');
  return call(who, {
    path: `/file?path=${encodeURIComponent(rel)}`,
    method: 'PUT',
    body: closed,
    headers: { 'Content-Type': 'text/markdown', 'If-Match': loaded.etag! },
  });
}

const LIMITED = /high risk: ask someone allowed to make high-risk calls/;

test('lookout-limited counts at every gate but the high-risk ones', () => {
  assert.equal(approvesGates('lookout-limited'), true);
  assert.equal(approvesHighRisk('lookout-limited'), false);
  assert.equal(approvesHighRisk('lookout'), true);
});

test('answers: a limited caller can’t answer a high-risk question; its other answers are lookout-limited', async () => {
  const refused = await answer('limited', 'q1');
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /question "q1" is high risk: ask someone allowed to make high-risk calls/);
  const plain = await answer('limited', 'q2');
  assert.equal(plain.status, 201);
  assert.equal(plain.body.via, 'lookout-limited');
  // signed with its label, so the asking process delivers it as lookout-limited, not as unlabelled chat
  const checked = checkAgentAnswer(root, plain.body as never, { sessionId: 's1', questionId: 'q2' });
  assert.deepEqual(checked, { kind: 'signed', how: { via: 'lookout-limited' } });
  const allowed = await answer('allowed', 'q1');
  assert.equal(allowed.status, 201);
  assert.equal(allowed.body.via, 'lookout');
  const unsaid = await answer('unsaid', 'q3');
  assert.equal(unsaid.body.via, 'lookout', 'no word from the sign-in: allowed, as before');
});

test('approving work: a limited caller can’t accept a high-risk ticket', async () => {
  const accept = (who: Who, t: Ticket) =>
    call(who, {
      path: '/verification/action',
      method: 'POST',
      body: { mapId, ticketId: t.id, action: 'accept', reason: 'Looks right' },
    });
  const refused = await accept('limited', tickets.risky);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, LIMITED);
  // with no evidence of what changed it fails closed, as from Slack (the default policy has high-risk path rules)
  assert.match((await accept('limited', tickets.plain2)).body.error, LIMITED);
  // an allowed caller gets past the high-risk guard (whatever the lifecycle makes of it after)
  assert.doesNotMatch(String((await accept('allowed', tickets.risky2)).body.error ?? ''), /high risk/);
});

test('decisions: a limited caller can’t record or supersede one on a high-risk ticket', async () => {
  const refused = await decision('limited', tickets.risky);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, LIMITED);
  assert.equal((await decision('limited', tickets.plain)).status, 201);
  const allowed = await decision('allowed', tickets.risky);
  assert.equal(allowed.status, 201);
  const supersede = (who: Who) =>
    call(who, {
      path: `/decisions/${encodeURIComponent(allowed.body.id)}/supersede`,
      method: 'POST',
      body: { trail: mapId, answer: 'No', decidedBy: 'trail lead', source: { kind: 'lookout', label: 'Logbook' } },
    });
  const superseded = await supersede('limited');
  assert.equal(superseded.status, 409);
  assert.match(superseded.body.error, LIMITED);
  // nor through the file route, the way the Lookout's own Logbook writes it
  const rel = `${mapId}/decisions/${allowed.body.id}.md`;
  const loaded = await call('limited', { path: `/file?path=${encodeURIComponent(rel)}` });
  assert.equal(loaded.status, 200);
  const edited = await call('limited', {
    path: `/file?path=${encodeURIComponent(rel)}`,
    method: 'PUT',
    body: loaded.text.replace(/Yes/, 'No'),
    headers: { 'Content-Type': 'text/markdown', 'If-Match': loaded.etag! },
  });
  assert.equal(edited.status, 403);
  assert.equal((await supersede('allowed')).status, 201);
});

test('supersede: a limited caller can’t move a high-risk decision to another ticket, or to none, to get past it', async () => {
  const supersede = (who: Who, id: string, ticketId: string) =>
    call(who, {
      path: `/decisions/${encodeURIComponent(id)}/supersede`,
      method: 'POST',
      body: { trail: mapId, ticketId, answer: 'No', decidedBy: 'trail lead', source: { kind: 'lookout' } },
    });
  for (const ticketId of [tickets.plain.id, '']) {
    const old = await decision('allowed', tickets.risky);
    for (const who of ['limited', 'limited-device'] as const) {
      const refused = await supersede(who, old.body.id, ticketId);
      assert.equal(refused.status, 409, `${who} naming "${ticketId}"`);
      assert.match(refused.body.error, LIMITED);
    }
    const kept = (await (await bridge.active()).listDecisions(mapId)).find((d) => d.id === old.body.id);
    assert.equal(kept?.supersededBy, undefined, 'the high-risk decision still stands');
    assert.equal((await supersede('allowed', old.body.id, ticketId)).status, 201);
  }
});

test('reroutes: a limited caller can’t approve one, and can decline', async () => {
  const env = { root, adapter: await bridge.active(), journal: journalFile(root) };
  const propose = (by: string, mode: 'plan-only' | 'plan+execute') =>
    proposeReroute(env, {
      mapId,
      kind: 'reroute',
      lane: 'setting',
      reason: `Switch to ${mode}`,
      evidence: 'why',
      invalidates: [],
      changes: [{ op: 'set_mode', mode }],
      by,
    });
  const { proposal } = await propose('claude-01', 'plan-only');
  const shown = await call('limited', { path: `/reroutes/${proposal.id}?map=${encodeURIComponent(mapId)}` });
  const decide = (who: Who, action: 'approve' | 'reject') =>
    call(who, {
      path: `/reroutes/${action}`,
      method: 'POST',
      body: { mapId, id: proposal.id, hash: shown.body.reroute.hash, note: 'No' },
    });
  const refused = await decide('limited', 'approve');
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /changes the plan or your settings: ask someone allowed to make high-risk calls/);
  assert.equal((await decide('allowed', 'approve')).status, 200);
  const second = (await propose('claude-02', 'plan+execute')).proposal;
  const declined = await call('limited', {
    path: '/reroutes/reject',
    method: 'POST',
    body: { mapId, id: second.id, note: 'Not now' },
  });
  assert.equal(declined.status, 200);
});

test('the file route: a limited caller can’t close a high-risk ticket, from this machine or a device', async () => {
  for (const who of ['limited', 'limited-device'] as const) {
    const refused = await closeByFile(who, tickets.risky);
    assert.equal(refused.status, 403, who);
    assert.match(refused.body.error, LIMITED);
    assert.equal(refused.body.highRisk, true);
  }
  assert.equal((await closeByFile('limited-device', tickets.plain)).status, 200, 'a plain ticket closes');
  assert.equal((await closeByFile('allowed', tickets.risky)).status, 200);
});

test('what this machine trusts: a limited caller is another device’s, whatever its kind', async () => {
  const policy = await call('allowed', { path: '/policy' });
  const put = (who: Who) => call(who, { path: '/policy', method: 'PUT', body: policy.body.policy ?? {} });
  const elsewhere = (r: Reply) => {
    assert.equal(r.status, 403);
    assert.equal(r.body.elsewhere, true);
  };
  elsewhere(await put('limited'));
  assert.equal((await put('allowed')).status, 200);
  // an outside close of a high-risk ticket, and a lowered policy, written to the repo by something else
  const file = path.join(root, mapId, 'tickets', `${tickets.risky2.id}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/state: open/, 'state: closed\nclose_reason: completed'));
  const lowered = { ...policy.body.policy, categories: { ...policy.body.policy.categories, schema: 'low' } };
  writeFileSync(path.join(root, 'policy.json'), JSON.stringify(lowered, null, 2));
  const pending = (await call('allowed', { path: '/trust' })).body.items as { key: string; hash: string }[];
  const items = pending.map(({ key, hash }) => ({ key, hash }));
  assert.ok(items.some((i) => i.key.includes('policy')) && items.length > 1, JSON.stringify(items));
  elsewhere(await call('limited', { path: '/trust/approve', method: 'POST', body: { items } }));
  elsewhere(await call('limited', { path: '/trust/revert', method: 'POST', body: items[0] }));
  // so the high-risk question is still high risk, and the ticket is still open to the gates
  assert.equal((await answer('limited', 'q1')).status, 409);
  const snap = await (await bridge.active()).loadMap(mapId);
  assert.equal(snap.tickets.find((t) => t.id === tickets.risky2.id)?.state, 'open');
  const approved = await call('allowed', { path: '/trust/approve', method: 'POST', body: { items } });
  assert.equal(approved.status, 200);
});
