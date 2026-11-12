/**
 * The bridge's `/slack` routes. A page on another site (DNS rebinding, a cross-site request) and another device on
 * the network must not read the link token, connect someone else's Slack or change where questions go; and no GET
 * holds a secret.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createTrackerBridge } from '@teamtrail/core/bridge';
import { thisMachineOnly } from '../../core/src/server/thisMachineRoutes';
import { slackPlugin } from '../src/node';
import { ANA, EVE, LINK, SCOUT_ENV, TOKENS, connected, freezeTime, liveWorld, readJson } from './harness';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

const WRITES: [string, string, unknown?][] = [
  ['POST', '/slack/connect/start', {}],
  ['POST', '/slack/connect/finish', { code: 'c'.repeat(43) }],
  ['DELETE', '/slack/connect'],
  ['PUT', '/slack/settings', { allow: [{ id: EVE }], notify: { target: 'C0RANDOM1' }, enabled: false }],
];
const READS = ['/slack', '/slack/members', '/slack/connect', '/slack/connect/start', '/slack/settings'];

type Answer = { status: number; body: string };

async function served(o: { owners?: boolean } = {}) {
  const l = liveWorld();
  if (o.owners !== false) connected(l.w, { allow: [] });
  let device: string | undefined;
  const bridge = createTrackerBridge(l.w.root, {
    peer: (req) => device ?? req.socket.remoteAddress,
    plugins: [
      slackPlugin({
        configDir: l.w.configDir,
        env: { ...SCOUT_ENV },
        fetch: l.w.fetch,
        WebSocket: l.w.hub.WebSocket,
        pollMs: 0,
      }),
    ],
  });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  /** A raw request, so `Host` and `Origin` are what the test says, as a browser under attack would send them. */
  const request = (method: string, p: string, o: { headers?: Record<string, string>; body?: unknown } = {}) =>
    new Promise<Answer>((resolve, reject) => {
      const payload = o.body === undefined ? undefined : JSON.stringify(o.body);
      const req = http.request(
        { host: '127.0.0.1', port, method, path: p, headers: { 'Content-Type': 'application/json', ...o.headers } },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on('error', reject);
      req.end(payload);
    });
  return {
    ...l,
    port,
    request,
    from: (address: string | undefined) => (device = address),
    config: () => readJson(path.join(l.w.configDir, 'slack.json')),
    creds: () => readJson(path.join(l.w.configDir, 'credentials.json')),
    close() {
      server.close();
      bridge.close();
      l.w.cleanup();
    },
  };
}

const SECRETS = [LINK.token, TOKENS.bot, 'xoxb-', 'stl_'];
const holdsSecret = (body: string) => SECRETS.find((s) => body.includes(s));

test('a rebinding page (its own domain as Host) or a cross-site page (its own Origin) gets nothing from /slack', async () => {
  const s = await served();
  try {
    const before = [s.config(), s.creds()];
    const attacks: Record<string, string>[] = [
      { Host: 'attacker.example' },
      { Host: `attacker.example:${s.port}` },
      { Host: `127.0.0.1:${s.port}`, Origin: 'https://attacker.example' },
      { Host: `127.0.0.1:${s.port}`, Origin: 'null' },
      { Host: `localhost:${s.port}`, Origin: `http://127.0.0.1:${s.port}` },
    ];
    for (const headers of attacks) {
      for (const p of READS) {
        const r = await s.request('GET', p, { headers });
        assert.equal(r.status, 403, `GET ${p} ${JSON.stringify(headers)}`);
        assert.doesNotMatch(r.body, /owners|workspace|members/, 'not even the status');
      }
      for (const [method, p, body] of WRITES) {
        const r = await s.request(method, p, { headers, body });
        assert.equal(r.status, 403, `${method} ${p} ${JSON.stringify(headers)}`);
        assert.equal(holdsSecret(r.body), undefined);
      }
    }
    assert.deepEqual([s.config(), s.creds()], before, 'the owner, the settings and the link are untouched');
  } finally {
    s.close();
  }
});

test('another device on the network: may read the status, without secrets; may not change or look up anything', async () => {
  const s = await served();
  try {
    const before = [s.config(), s.creds()];
    s.from('192.168.1.50');
    const status = await s.request('GET', '/slack');
    assert.equal(status.status, 200);
    assert.equal(JSON.parse(status.body).owners[0].id, ANA);
    assert.equal(holdsSecret(status.body), undefined);
    const members = await s.request('GET', '/slack/members');
    assert.deepEqual(
      [members.status, JSON.parse(members.body).elsewhere],
      [403, true],
      'the member list uses the token',
    );
    for (const [method, p, body] of WRITES) {
      const r = await s.request(method, p, { body });
      assert.deepEqual([r.status, JSON.parse(r.body).elsewhere], [403, true], `${method} ${p}`);
      assert.equal(holdsSecret(r.body), undefined);
    }
    assert.deepEqual([s.config(), s.creds()], before);
    assert.equal(s.methods().filter((m) => m === 'users.list').length, 0);
  } finally {
    s.close();
  }
});

test('the list of this-machine-only Slack routes, as the predicate reads it', () => {
  for (const [method, p] of WRITES) assert.equal(thisMachineOnly(method, p), true, `${method} ${p}`);
  assert.equal(thisMachineOnly('GET', '/slack/members'), true);
  assert.equal(thisMachineOnly('GET', '/slack/anything-added-later'), true);
  assert.equal(thisMachineOnly('GET', '/slack'), false, 'the status stays readable from a phone');
  assert.equal(thisMachineOnly('GET', '/slackers'), false);
});

test('on this machine: no GET returns the link token; Add Scout to Slack starts with an address and nothing secret', async () => {
  const s = await served();
  try {
    for (const p of READS) {
      const r = await s.request('GET', p);
      assert.equal(holdsSecret(r.body), undefined, `GET ${p}`);
      assert.ok(
        p === '/slack' || p === '/slack/members' ? r.status === 200 : r.status === 405,
        `GET ${p}: ${r.status}`,
      );
    }
    const started = await s.request('POST', '/slack/connect/start', { body: {} });
    assert.equal(started.status, 200);
    const url = new URL(JSON.parse(started.body).url);
    assert.equal(url.origin, 'https://scout.test');
    assert.equal(url.searchParams.get('return'), `http://127.0.0.1:${s.port}/?settings=slack`);
    assert.equal(holdsSecret(started.body), undefined);
    assert.equal(holdsSecret(JSON.stringify(s.config())), undefined, 'slack.json holds no token');
    const bad = await s.request('POST', '/slack/connect/finish', { body: {} });
    assert.equal(bad.status, 400, 'a code is required');
  } finally {
    s.close();
  }
});

test('there is no HTTP way in for Slack events here: they reach this machine only through the Scout service', async () => {
  const s = await served();
  try {
    const before = s.methods().length;
    for (const p of ['/slack/events', '/slack/interactive', '/slack/commands', '/slack/actions']) {
      const challenge = await s.request('POST', p, { body: { type: 'url_verification', challenge: 'c0ffee' } });
      assert.equal(challenge.status, 405, p);
      assert.doesNotMatch(challenge.body, /c0ffee/);
      const click = await s.request('POST', p, {
        body: { type: 'block_actions', user: { id: ANA }, actions: [{ action_id: 'verify_approve', value: '{}' }] },
      });
      assert.equal(click.status, 405, p);
    }
    assert.equal(s.methods().length, before);
  } finally {
    s.close();
  }
});
