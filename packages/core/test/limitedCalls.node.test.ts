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
import { agentPaths, type AgentSessionDoc } from '../src/agents/agentLink';
import {
  createProjectsHub,
  createTrackerBridge,
  type ExternalSignIn,
  type ProjectsHub,
  type TrackerBridge,
} from '../src/bridge';
import { writeLocalJson } from '../src/lib/ensureLocalDir';
import { sendJson } from '../src/server/http';
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
    ['createDecision', ['3', { ticketId: '7', question: 'Q', answer: 'A', decidedBy: 'trail lead' }]],
  ] as const) {
    const refused = await trackerCall('limited', method, [...args]);
    assert.equal(refused.status, 403, method);
    assert.match(String(refused.body.error), /Ticket 7 is high risk: ask someone allowed to make high-risk calls/);
    // an allowed caller's call goes on to GitHub (which has no such issue): not refused here
    assert.notEqual((await trackerCall('allowed', method, [...args])).status, 403, method);
  }
  // another ticket, and calls that decide nothing, go on to GitHub
  assert.notEqual((await trackerCall('limited', 'close', ['3', '8', 'completed'])).status, 403);
  assert.notEqual((await trackerCall('limited', 'comment', ['3', '7', 'trail lead', 'hi'])).status, 403);
});
