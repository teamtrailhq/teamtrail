/**
 * On a GitHub or Linear tracker the Lookout closes tickets and records decisions through tracker calls: a caller an
 * embedding server's sign-in denies high-risk calls (`highRisk: false`) can't make those on a high-risk ticket, as
 * through the raw file route (limitedCaller.node.test.ts).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { agentPaths, type AgentSessionDoc } from '../src/agents/agentLink';
import {
  createProjectsHub,
  createTrackerBridge,
  type ExternalSignIn,
  type ProjectsHub,
  type TrackerBridge,
} from '../src/bridge';
import { writeLocalJson } from '../src/lib/ensureLocalDir';
import type { DecisionInput } from '../src/model/types';
import { chartMap } from '../src/planning/operations/chart';
import { recordDecision, supersedeDecision } from '../src/planning/operations/decisionOps';
import { lookoutOnlyTickets } from '../src/policy/lookoutOnlyTickets';
import { ticketNeedsLookout } from '../src/policy/ticketNeedsLookout';
import { sendJson } from '../src/server/http';
import { limitedCallRefusal } from '../src/server/limitedCallRefusal';
import { fakeGitHub } from './fakes/github';

const external: ExternalSignIn = {
  admit(req, res) {
    const who = req.headers['x-test-caller'];
    if (who !== 'limited' && who !== 'allowed') return void sendJson(res, 401, { error: 'sign in first' });
    return { id: `p-${who}`, kind: 'machine', highRisk: who === 'allowed' };
  },
};
const HOST = 'ws-1.example.test';
const fake = fakeGitHub({ repo: 'octo-org/launchpad' });

let bridge: TrackerBridge;
let hub: ProjectsHub;
let server: http.Server;
let port: number;

before(async () => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-limited-calls-'));
  const root = path.join(top, 'repo', '.teamtrail');
  const configDir = path.join(top, 'config');
  mkdirSync(root, { recursive: true });
  const exec = async (cmd: string) => {
    if (cmd === 'git') return 'git@github.com:octo-org/launchpad.git';
    throw new Error('unexpected command');
  };
  const peer = () => '127.0.0.1';
  const options = { env: {}, exec, fetch: fake.fetch, configDir, peer, allowedHosts: [HOST] };
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
  // An agent asked about ticket 7 of trail 3 with a category the default policy makes high: 7 is high risk.
  writeLocalJson(root, agentPaths.session('s1'), {
    v: 1,
    session: { id: 's1', agent: 'claude-01', mode: 'work', mapId: '3', step: 1, total: 1, stepLabel: 'Ask' },
    chats: [],
    pending: [
      {
        id: 'q1',
        sessionId: 's1',
        mapId: '3',
        ticketId: '7',
        agent: 'claude-01',
        text: 'Drop?',
        at: 1,
        category: 'schema',
      },
    ],
    answered: [],
    feed: [],
    pid: process.pid,
    updatedAt: Date.now(),
  } as unknown as AgentSessionDoc);
});

after(() => {
  hub.close();
  bridge.close();
  server.closeAllConnections();
  server.close();
});

function call(who: string, o: { path: string; method?: string; body?: unknown }) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const headers = { Host: HOST, 'x-test-caller': who, 'Content-Type': 'application/json' };
    const req = http.request({ host: '127.0.0.1', port, path: o.path, method: o.method ?? 'GET', headers }, (res) => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (out += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: out.startsWith('{') ? JSON.parse(out) : {} }));
    });
    req.on('error', reject);
    req.end(o.body === undefined ? undefined : JSON.stringify(o.body));
  });
}

const trackerCall = (who: string, method: string, args: unknown[]) =>
  call(who, { path: '/tracker/github/call', method: 'POST', body: { method, args } });

test('a limited caller can’t close, reopen or record a decision on a high-risk ticket through tracker calls', async () => {
  const connected = await call('allowed', {
    path: '/trackers',
    method: 'PUT',
    body: { active: 'github', github: { repo: 'octo-org/launchpad', token: 'github_pat_test_0000' } },
  });
  assert.equal(connected.status, 200);
  for (const [method, args] of [
    ['close', ['3', '7', 'completed']],
    ['reopen', ['3', '7']],
  ] as const) {
    const refused = await trackerCall('limited', method, [...args]);
    assert.equal(refused.status, 403, method);
    assert.match(String(refused.body.error), /Ticket 7 is high risk: ask someone allowed to make high-risk calls/);
    // an allowed caller's call goes on to GitHub (which has no such issue): not refused here
    assert.notEqual((await trackerCall('allowed', method, [...args])).status, 403, method);
  }
  // a limited caller is another device's: no decisions through tracker calls at all
  for (const [method, args] of [
    ['createDecision', ['3', { ticketKey: '#7', question: 'Q', answer: 'A', decidedBy: 'trail lead' }]],
    ['markSuperseded', ['3', 'D-1', 'D-2']],
  ] as const) {
    const refused = await trackerCall('limited', method, [...args]);
    assert.equal(refused.status, 403, method);
    assert.equal(refused.body.elsewhere, true, method);
  }
  // another ticket, and calls that decide nothing, go on to GitHub
  assert.notEqual((await trackerCall('limited', 'close', ['3', '8', 'completed'])).status, 403);
  assert.notEqual((await trackerCall('limited', 'comment', ['3', '7', 'trail lead', 'hi'])).status, 403);
});

/** A memory tracker with a high-risk ticket (an agent asked about it with "schema"), a plain one and a decision on each. */
async function memoryTrail() {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-limited-unit-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  const adapter = new MemoryAdapter({ latency: [0, 0] });
  const { map, tickets } = await chartMap(adapter, {
    title: 'Users',
    sections: { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    tickets: [
      { ref: 'drop', title: 'Drop the old table?', type: 'junction', body: '' },
      { ref: 'copy', title: 'Button copy', type: 'junction', body: '' },
    ],
  });
  const [risky, plain] = tickets;
  lookoutOnlyTickets.mark(root, { mapId: map.id, ticketId: risky.id, categories: ['schema'] });
  const decide = (t: typeof risky, extra: Partial<DecisionInput> = {}) =>
    recordDecision(adapter, map.id, {
      ticketId: t.id,
      ticketKey: t.key,
      question: t.title,
      answer: 'Yes',
      summary: 'Yes',
      decidedBy: 'trail lead',
      source: { kind: 'lookout' },
      ...extra,
    });
  return { root, adapter, mapId: map.id, risky, plain, decide };
}

test('limitedCallRefusal (defence in depth): a decision by ticket key, and marking a high-risk one superseded', async () => {
  const t = await memoryTrail();
  const onRisky = await t.decide(t.risky);
  const onPlain = await t.decide(t.plain);
  const highByRisk = await t.decide(t.plain, { risk: { level: 'high', category: 'schema', reason: 'schema' } });
  const refusal = (method: string, args: unknown[]) =>
    limitedCallRefusal({ root: t.root, adapter: async () => t.adapter }, { method, args });
  assert.match(String(await refusal('createDecision', [t.mapId, { ticketKey: t.risky.key }])), /high risk/);
  assert.match(String(await refusal('markSuperseded', [t.mapId, onRisky.id, 'D-9'])), /high risk/);
  assert.match(String(await refusal('markSuperseded', [t.mapId, highByRisk.id, 'D-9'])), /high risk/);
  assert.equal(await refusal('markSuperseded', [t.mapId, onPlain.id, 'D-9']), undefined);
  assert.equal(await refusal('createDecision', [t.mapId, { ticketKey: t.plain.key }]), undefined);
});

test('supersedeDecision: the old decision’s ticket and risk count, whatever ticket the new one names', async () => {
  const t = await memoryTrail();
  const limited = {
    via: 'lookout-limited' as const,
    highRisk: (m: string, id: string) => ticketNeedsLookout(t.root, m, id),
  };
  const input = { answer: 'No', decidedBy: 'trail lead', source: { kind: 'lookout' as const }, guard: limited };
  const onRisky = await t.decide(t.risky);
  for (const ticketId of [t.plain.id, ''])
    await assert.rejects(
      supersedeDecision(t.adapter, t.mapId, onRisky.id, { ...input, ticketId }),
      /high risk: ask someone allowed to make high-risk calls/,
    );
  const highByRisk = await t.decide(t.plain, { risk: { level: 'high', category: 'schema', reason: 'schema' } });
  await assert.rejects(supersedeDecision(t.adapter, t.mapId, highByRisk.id, input), /high risk/);
  // moving a plain decision onto the high-risk ticket is refused too; a plain one on its own ticket goes through
  const onPlain = await t.decide(t.plain);
  await assert.rejects(supersedeDecision(t.adapter, t.mapId, onPlain.id, { ...input, ticketId: t.risky.id }));
  assert.ok(await supersedeDecision(t.adapter, t.mapId, onPlain.id, input));
  assert.ok(
    await supersedeDecision(t.adapter, t.mapId, onRisky.id, { ...input, guard: { ...limited, via: 'lookout' } }),
  );
});
