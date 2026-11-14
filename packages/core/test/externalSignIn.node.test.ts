import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import {
  createProjectsHub,
  createTrackerBridge,
  type ExternalSignIn,
  type ProjectsHub,
  type TrackerBridge,
} from '../src/bridge';
import { sendJson } from '../src/server/http';

// A server that embeds the Lookout with its own sign-in: the `x-test-caller` header stands in for whatever it
// verifies (a gateway's signed header). `machine` callers count as this machine through the hub's peer.
const callers = new WeakMap<http.IncomingMessage, string>();
const external: ExternalSignIn = {
  admit(req, res, at) {
    const kind = req.headers['x-test-caller'];
    if (kind !== 'machine' && kind !== 'device') return void sendJson(res, 401, { error: 'sign in first' });
    callers.set(req, kind);
    if (at.route === '/session') return void sendJson(res, 200, { signedIn: true, managed: { name: 'Ada' } });
    return { id: `p-${kind}`, kind };
  },
};
const peer = (req: http.IncomingMessage) => (callers.get(req) === 'machine' ? '127.0.0.1' : 'proxied');
const HOST = 'ws-1.example.test';

let top: string;
let bridge: TrackerBridge;
let hub: ProjectsHub;
let server: http.Server;
let port: number;

before(async () => {
  top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-external-'));
  const root = path.join(top, 'repo', '.teamtrail');
  const configDir = path.join(top, 'config');
  mkdirSync(path.join(root, 'trail', 'tickets'), { recursive: true });
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
  // a socket from the proxy, never loopback: whatever the hub decides comes from the caller, not the address
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

function call(o: { path: string; method?: string; headers?: Record<string, string> }) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: o.path, method: o.method ?? 'GET', headers: { Host: HOST, ...o.headers } },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: text.startsWith('{') ? JSON.parse(text) : {} }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('nothing is reached without the external sign-in, and it answers GET /session itself', async () => {
  assert.equal((await call({ path: '/attention' })).status, 401);
  const session = await call({ path: '/session', headers: { 'x-test-caller': 'device' } });
  assert.deepEqual(session.body, { signedIn: true, managed: { name: 'Ada' } });
});

test('a device caller is refused what only this machine may do; a machine caller is not', async () => {
  const device = await call({ path: '/remote-agents', headers: { 'x-test-caller': 'device' } });
  assert.equal(device.status, 403);
  assert.equal(device.body.elsewhere, true);
  const machine = await call({ path: '/remote-agents', headers: { 'x-test-caller': 'machine' } });
  assert.equal(machine.status, 200);
});

test('a device caller is a device in the projects it opens too', async () => {
  const device = await call({ path: `/p/${hub.homeId}/remote-agents`, headers: { 'x-test-caller': 'device' } });
  assert.equal(device.status, 403);
});

test('local sign-in routes are not there: no pairing, no session list', async () => {
  const pair = await call({ path: '/pair', method: 'POST', headers: { 'x-test-caller': 'machine' } });
  assert.notEqual(pair.status, 200);
  const sessions = await call({ path: '/sign-in/sessions', headers: { 'x-test-caller': 'machine' } });
  assert.equal(sessions.status, 404);
});

test('the allowed host is answered and any other name is refused', async () => {
  const other = await call({ path: '/attention', headers: { Host: 'evil.example.test', 'x-test-caller': 'machine' } });
  assert.equal(other.status, 403);
  const cross = await call({
    path: '/attention',
    headers: { Origin: 'https://evil.example.test', 'x-test-caller': 'machine' },
  });
  assert.equal(cross.status, 403);
  const own = await call({ path: '/attention', headers: { Origin: `https://${HOST}`, 'x-test-caller': 'machine' } });
  assert.equal(own.status, 200);
});
