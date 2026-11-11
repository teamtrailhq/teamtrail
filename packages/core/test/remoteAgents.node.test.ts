import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { claimTrailName, releaseTrailName } from '../src/agents/trailNameClaim';
import { createProjectsHub, createTrackerBridge, fromThisMachine, type TrackerBridge } from '../src/bridge';
import { journalFile, journalPath } from '../src/history/journalFile';
import { blobHash } from '../src/knowledge/knowledgeStore';
import { REMOTE_AGENTS_JOURNAL } from '../src/model/lifecycle';
import type { McpEndpoint, RemoteTokenView } from '../src/model/remoteToken';
import { webUrl } from '../src/model/webUrl';
import { readMcpEndpoints, writeMcpEndpoint } from '../src/remoteAgents/mcpEndpoints';
import {
  createRemoteToken,
  remoteTokenLive,
  remoteTokenViews,
  revokeRemoteToken,
  touchRemoteToken,
  verifyRemoteToken,
} from '../src/remoteAgents/remoteTokens';
import { REMOTE_TOKENS_FILE } from '../src/remoteAgents/remoteTokenStore';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';
import { NO_GH_CLI_ENV, resolveGitHubToken } from '../src/server/trackerConfig';
import { pairedSignIn, pairSession, sessionHeader } from './fakes/signedIn';

const tmp = (name: string) =>
  path.join(mkdtempSync(path.join(os.tmpdir(), `teamtrail-${name}-`)), 'repo', '.teamtrail');

let server: http.Server;
let bridge: TrackerBridge;
let base: string;
let root: string;

before(async () => {
  root = tmp('remote-routes');
  mkdirSync(root, { recursive: true });
  bridge = createTrackerBridge(root, { env: {}, cwd: path.dirname(root) });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  bridge.close();
  server.close();
});

type View = {
  tokens: RemoteTokenView[];
  endpoints: McpEndpoint[];
  token?: string;
  created?: RemoteTokenView;
  error?: string;
};
const call = async (method: string, p: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, text: await r.clone().text(), json: (await r.json()) as View, headers: r.headers };
};

test('a token is random, verified by hash in constant time, and only its hash is stored', () => {
  const r = tmp('remote-tokens');
  assert.equal(verifyRemoteToken(r, 'tt_anything'), undefined, 'no tokens: nothing verifies');
  const a = createRemoteToken(r, '  cloud   sandbox ');
  const b = createRemoteToken(r, 'laptop');
  assert.match(a.token, /^tt_[\w-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.view.name, 'cloud sandbox');
  const stored = readFileSync(path.join(r, REMOTE_TOKENS_FILE), 'utf8');
  assert.ok(!stored.includes(a.token) && !stored.includes(a.token.slice(3)), 'the token itself is never written');
  assert.match(stored, /"hash": "[0-9a-f]{64}"/);
  assert.equal(readFileSync(path.join(r, '.agents', '.gitignore'), 'utf8'), '*\n');

  assert.equal(verifyRemoteToken(r, a.token)?.id, a.view.id);
  assert.equal(verifyRemoteToken(r, b.token)?.id, b.view.id);
  for (const wrong of [`${a.token}x`, a.token.slice(0, -1), a.token.slice(3), '', 'tt_', `tt_${'a'.repeat(500)}`])
    assert.equal(verifyRemoteToken(r, wrong), undefined);
  assert.equal('hash' in remoteTokenViews(r)[0], false);
});

test('names are required, unique and short; revoking removes exactly that token', () => {
  const r = tmp('remote-names');
  const a = createRemoteToken(r, 'sandbox');
  assert.throws(() => createRemoteToken(r, 'Sandbox'), /already exists/);
  assert.throws(() => createRemoteToken(r, '   '), /Name the agent/);
  assert.throws(() => createRemoteToken(r, 'x'.repeat(61)), /under 60/);
  assert.throws(() => createRemoteToken(r, 42), /Name the agent/);
  const b = createRemoteToken(r, 'laptop');
  assert.equal(revokeRemoteToken(r, 'rt_unknown'), undefined);
  assert.equal(revokeRemoteToken(r, a.view.id)?.name, 'sandbox');
  assert.equal(verifyRemoteToken(r, a.token), undefined);
  assert.equal(remoteTokenLive(r, a.view.id), false);
  assert.equal(verifyRemoteToken(r, b.token)?.name, 'laptop');
  // the name is free again, and the new token is a different one
  const again = createRemoteToken(r, 'sandbox');
  assert.equal(verifyRemoteToken(r, a.token), undefined);
  assert.equal(verifyRemoteToken(r, again.token)?.id, again.view.id);
});

test('last use is kept apart from the tokens, so recording it can never bring a revoked token back', () => {
  const r = tmp('remote-use');
  const a = createRemoteToken(r, 'sandbox', 1000);
  touchRemoteToken(r, a.view.id, 5_000_000);
  touchRemoteToken(r, a.view.id, 5_030_000);
  assert.equal(remoteTokenViews(r)[0].lastUsedAt, 5_000_000, 'kept to the minute');
  touchRemoteToken(r, a.view.id, 5_070_000);
  assert.equal(remoteTokenViews(r)[0].lastUsedAt, 5_070_000);
  revokeRemoteToken(r, a.view.id);
  touchRemoteToken(r, a.view.id, 9_000_000);
  assert.deepEqual(remoteTokenViews(r), []);
  assert.equal(verifyRemoteToken(r, a.token), undefined);
});

test('a damaged token file closes the endpoint instead of opening it', () => {
  const r = tmp('remote-damaged');
  const a = createRemoteToken(r, 'sandbox');
  writeFileSync(path.join(r, REMOTE_TOKENS_FILE), '{ "v": 1, "tokens": [{ "id": "x" }, null, 3] ');
  assert.equal(verifyRemoteToken(r, a.token), undefined);
  writeFileSync(path.join(r, REMOTE_TOKENS_FILE), '{ "v": 1, "tokens": [{ "id": "x" }, null, 3] }');
  assert.deepEqual(remoteTokenViews(r), []);
});

test('routes: the token is shown once, lists never carry it, and both actions are journaled', async () => {
  const empty = await call('GET', '/remote-agents');
  assert.deepEqual(empty.json, { tokens: [], endpoints: [] });

  const made = await call('POST', '/remote-agents/tokens', { name: 'cloud sandbox' });
  assert.equal(made.status, 200);
  assert.match(made.json.token ?? '', /^tt_/);
  assert.equal(made.headers.get('cache-control'), 'no-store');
  assert.equal(made.json.created?.name, 'cloud sandbox');
  const token = made.json.token!;
  assert.equal(verifyRemoteToken(root, token)?.id, made.json.created?.id);

  const listed = await call('GET', '/remote-agents');
  assert.equal(listed.json.tokens.length, 1);
  assert.ok(!listed.text.includes(token) && !listed.text.includes('hash'));

  assert.equal((await call('POST', '/remote-agents/tokens', { name: 'cloud sandbox' })).status, 400);
  assert.equal((await call('POST', '/remote-agents/tokens', {})).status, 400);
  assert.equal((await call('POST', '/remote-agents/tokens/revoke', { id: 'rt_nope' })).status, 404);
  assert.equal((await call('POST', '/remote-agents/tokens/revoke', {})).status, 400);

  const revoked = await call('POST', '/remote-agents/tokens/revoke', { id: made.json.created!.id });
  assert.deepEqual(revoked.json.tokens, []);
  assert.equal(verifyRemoteToken(root, token), undefined);

  const entries = journalFile(root).readRemoteAgents(REMOTE_AGENTS_JOURNAL);
  assert.deepEqual(
    entries.map((e) => [e.action, e.name, e.tokenId, e.actor, e.actorKind]),
    [
      ['token-created', 'cloud sandbox', made.json.created!.id, 'trail lead', 'trail lead'],
      ['token-revoked', 'cloud sandbox', made.json.created!.id, 'trail lead', 'trail lead'],
    ],
  );
  const journal = readFileSync(journalPath(root, REMOTE_AGENTS_JOURNAL), 'utf8');
  assert.ok(!journal.includes(token) && !journal.includes('hash'), 'the journal never holds the token');
  assert.ok(existsSync(path.join(root, '.events', '.gitignore')));
});

/** A raw request: the headers a browser page under an attacker's control would arrive with. */
function raw(o: { method?: string; path: string; headers?: Record<string, string>; body?: string; port?: number }) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: o.port ?? Number(new URL(base).port),
        path: o.path,
        method: o.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...o.headers },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on('error', reject);
    req.end(o.body);
  });
}

const REBINDING: [string, Record<string, string>][] = [
  ['a name that resolves here', { Host: 'trail.example.com' }],
  ['a rebinding page, same-origin to itself', { Host: 'evil.example:7420', Origin: 'http://evil.example:7420' }],
  ['a host disguised as credentials', { Host: 'evil.example@127.0.0.1' }],
];

test('bridge: a request for another host never gets in, whatever route it asks for', async () => {
  mkdirSync(path.join(root, 'trail'), { recursive: true });
  writeFileSync(path.join(root, 'trail', 'map.md'), '# map');
  const tokensBefore = remoteTokenViews(root).length;
  for (const [what, headers] of REBINDING) {
    const attempts = [
      await raw({ method: 'POST', path: '/remote-agents/tokens', headers, body: '{"name":"evil"}' }),
      await raw({ method: 'PUT', path: '/file?path=verification.json', headers, body: '{"v":1}' }),
      await raw({ method: 'PUT', path: '/file?path=.agents/remote-tokens.json', headers, body: '{}' }),
      await raw({ path: '/file?path=trail/map.md', headers }),
      await raw({ path: '/list', headers }),
      await raw({ path: '/agents', headers }),
      await raw({ path: '/events', headers }),
    ];
    assert.deepEqual(
      attempts.map((r) => r.status),
      attempts.map(() => 403),
      what,
    );
  }
  assert.equal(remoteTokenViews(root).length, tokensBefore);
  assert.equal(existsSync(path.join(root, 'verification.json')), false);
});

test('bridge: an Origin must be the server\'s own, scheme included; "null" is refused, not a crash', async () => {
  const own = new URL(base).host;
  const status = async (origin: string) =>
    (await raw({ method: 'POST', path: '/remote-agents/tokens', headers: { Origin: origin }, body: '{}' })).status;
  assert.equal(await status('null'), 403);
  assert.equal(await status('http://evil.example'), 403);
  assert.equal(await status(`https://${own}`), 403, 'same host, other scheme');
  assert.equal(await status(`http://${own.replace('127.0.0.1', 'localhost')}`), 403, 'same machine, other origin');
  assert.equal(await status(`http://${own}`), 400, 'the Lookout itself gets through to the route (which wants a name)');
  // By IP or localhost, with no Origin (a GET from the page), everything works as before.
  assert.equal((await raw({ path: '/agents', headers: { Host: `localhost:${new URL(base).port}` } })).status, 200);
});

test('bridge: the raw file route only touches tracker markdown', async () => {
  const token = createRemoteToken(root, 'file route').token;
  const refused = [
    '.agents/remote-tokens.json',
    '.agents/sessions/x.json',
    '.agents/x.md',
    '.events/_remote-agents.jsonl',
    '.evidence/x.md',
    'verification.json',
    'policy.json',
    'trail/.hidden/x.md',
    '../outside.md',
    '',
  ];
  for (const p of refused) {
    const q = `/file?path=${encodeURIComponent(p)}`;
    assert.equal((await raw({ path: q })).status, 400, `read ${p}`);
    assert.equal((await raw({ method: 'PUT', path: q, body: 'x' })).status, 400, `write ${p}`);
  }
  assert.ok(verifyRemoteToken(root, token), 'the token file was not overwritten');
  assert.equal(existsSync(path.join(root, 'verification.json')), false);
  assert.equal((await raw({ method: 'PUT', path: '/file?path=trail/notes.md', body: '# ok' })).status, 200);
  assert.equal((await raw({ path: '/file?path=trail/notes.md' })).text, '# ok');
});

test('bridge: tokens are managed from this machine only; another device on the network still gets the rest', async () => {
  const r = tmp('remote-peer');
  mkdirSync(r, { recursive: true });
  // The peer is the socket's address; here a header stands in for a phone on the LAN.
  const lan = createTrackerBridge(r, {
    env: {},
    cwd: path.dirname(r),
    peer: (req) => (req.headers['x-test-peer'] as string | undefined) ?? req.socket.remoteAddress,
  });
  const srv = http.createServer((req, res) => void lan.handle(req, res));
  await new Promise<void>((done) => srv.listen(0, '127.0.0.1', done));
  const port = (srv.address() as { port: number }).port;
  const phone = { 'x-test-peer': '192.168.1.20', Host: `192.168.1.5:${port}` };
  try {
    const list = await raw({ port, path: '/remote-agents', headers: phone });
    assert.equal(list.status, 403);
    assert.equal(JSON.parse(list.text).elsewhere, true);
    const make = await raw({
      port,
      method: 'POST',
      path: '/remote-agents/tokens',
      headers: phone,
      body: '{"name":"x"}',
    });
    assert.equal(make.status, 403);
    assert.deepEqual(remoteTokenViews(r), []);
    assert.equal((await raw({ port, path: '/agents', headers: phone })).status, 200, 'the Lookout by IP keeps working');
    const here = await raw({ port, method: 'POST', path: '/remote-agents/tokens', body: '{"name":"x"}' });
    assert.equal(here.status, 200);
    const revoke = await raw({
      port,
      method: 'POST',
      path: '/remote-agents/tokens/revoke',
      headers: phone,
      body: JSON.stringify({ id: JSON.parse(here.text).created.id }),
    });
    assert.equal(revoke.status, 403);
    assert.equal(remoteTokenViews(r).length, 1);
  } finally {
    lan.close();
    srv.close();
  }
});

test('another device on the network reads, answers and approves, but changes nothing this machine runs or trusts', async () => {
  const r = tmp('remote-lan');
  mkdirSync(r, { recursive: true });
  const lan = createTrackerBridge(r, {
    env: {},
    configDir: tmp('remote-lan-config'),
    cwd: path.dirname(r),
    peer: (req) => (req.headers['x-test-peer'] as string | undefined) ?? req.socket.remoteAddress,
  });
  const srv = http.createServer((req, res) => void lan.handle(req, res));
  await new Promise<void>((done) => srv.listen(0, '127.0.0.1', done));
  const port = (srv.address() as { port: number }).port;
  const phone = { 'x-test-peer': '192.168.1.20', Host: `192.168.1.5:${port}` };
  const from = (headers: Record<string, string>, method: string, p: string) =>
    raw({ port, method, path: p, headers, body: method === 'GET' ? undefined : '{}' }).catch((e) => {
      throw new Error(`${method} ${p}: ${(e as Error).message}`);
    });
  const REFUSED: [string, string][] = [
    ['GET', '/remote-agents'],
    ['POST', '/remote-agents/tokens'],
    ['POST', '/remote-agents/tokens/revoke'],
    ['PUT', '/trackers'],
    ['POST', '/trackers/test'],
    ['DELETE', '/trackers/credentials/github'],
    ['POST', '/trackers/github/sign-in/start'],
    ['DELETE', '/trackers/github/sign-in'],
    ['POST', '/trackers/linear/teams'],
    // lookups with this machine's stored credentials: the repos a token can see, a key's teams and projects
    ['GET', '/trackers/github/repos'],
    ['GET', '/trackers/linear/teams'],
    ['GET', '/trackers/linear/projects?team=T1'],
    ['PUT', '/attention/prefs'],
    ['POST', '/slack/setup'],
    ['PUT', '/policy'],
    ['PUT', '/workspaces'],
    ['POST', '/workspaces/remove'],
    ['POST', '/guides/approve'],
    ['POST', '/guides/checks/approve'],
    ['POST', '/guides/catalog/add'],
    // which guide a ticket or a trail's team uses brings that guide's checks: trust, not steering
    ['POST', '/guides/ticket'],
    ['POST', '/guides/team'],
    // the raw file route: anything but a trail's map or tickets, and their trust fields, is this machine's
    ['PUT', '/file?path=trail/notes.md'],
    // ... and a new trail or ticket: the phone moves existing work along, it doesn't add any
    ['PUT', '/file?path=trail/map.md'],
    ['POST', '/guides/remove'],
    ['PUT', '/file?path=verification.json'],
  ];
  const OPEN: [string, string][] = [
    ['GET', '/machine'],
    ['GET', '/list'],
    ['GET', '/agents'],
    ['POST', '/agents/answer'],
    ['GET', '/agents/leases'],
    ['POST', '/agents/leases/release'],
    ['GET', '/trackers'],
    ['GET', '/policy'],
    ['GET', '/workspaces'],
    ['GET', '/guides'],
    ['GET', '/verification/config'],
    ['POST', '/verification/action'],
    ['POST', '/criteria/confirm'],
    ['POST', '/attention/snooze'],
    ['POST', '/journal'],
  ];
  try {
    for (const [method, p] of REFUSED) {
      const res = await from(phone, method, p);
      assert.ok(res.status === 403 || res.status === 400, `${method} ${p} from the phone: ${res.status}`);
      if (!p.startsWith('/file')) assert.equal(JSON.parse(res.text).elsewhere, true, `${method} ${p}`);
    }
    for (const [method, p] of OPEN) {
      const res = await from(phone, method, p);
      assert.notEqual(res.status, 403, `${method} ${p} from the phone`);
    }
    // Approving and re-running are steering; how much proof a trail needs is a trust setting.
    const action = (headers: Record<string, string>, body: unknown) =>
      raw({ port, method: 'POST', path: '/verification/action', headers, body: JSON.stringify(body) });
    const level = await action(phone, { action: 'level', mapId: 'trail', level: 'off' });
    assert.equal(level.status, 403);
    assert.equal(JSON.parse(level.text).elsewhere, true);
    assert.notEqual((await action(phone, { action: 'approve', mapId: 'trail', ticketId: '1' })).status, 403);
    assert.notEqual((await action({}, { action: 'level', mapId: 'trail', level: 'off' })).status, 403);

    // What the phone reads says nothing about where things live on this disk.
    const far = JSON.parse((await from(phone, 'GET', '/list')).text) as { root: string };
    const near = JSON.parse((await from({}, 'GET', '/list')).text) as { root: string };
    assert.ok(path.isAbsolute(near.root));
    assert.equal(far.root, near.root.split(path.sep).slice(-2).join('/'));
    assert.equal('account' in (JSON.parse((await from(phone, 'GET', '/trackers')).text).github ?? {}), false);

    // A brief is a trail's; an id is an id.
    const brief = (mapId: string) =>
      raw({ port, method: 'POST', path: '/briefs/create', headers: phone, body: JSON.stringify({ mapId }) });
    assert.equal((await brief('no-such-trail')).status, 404);
    assert.equal((await brief('../../outside')).status, 400);
    assert.equal(existsSync(path.join(r, 'briefs')), false);
    const answer = (sessionId: string) =>
      raw({
        port,
        method: 'POST',
        path: '/agents/answer',
        headers: phone,
        body: JSON.stringify({ sessionId, questionId: 'q1', text: 'yes' }),
      });
    assert.equal((await answer('../../../etc/x')).status, 400);
    assert.equal((await answer('a/b')).status, 400);
    assert.deepEqual(JSON.parse((await from(phone, 'GET', '/machine')).text), { local: false });
    assert.deepEqual(JSON.parse((await from({}, 'GET', '/machine')).text), { local: true });
    assert.equal(existsSync(path.join(r, 'policy.json')), false);
    assert.equal(existsSync(path.join(r, 'workspaces.json')), false);
  } finally {
    lan.close();
    srv.close();
  }
});

test('the projects hub: another device sees the projects, and cannot add, remove or reconfigure them', async () => {
  const r = tmp('remote-hub');
  const configDir = tmp('remote-hub-config');
  mkdirSync(r, { recursive: true });
  const peer = (req: http.IncomingMessage) =>
    (req.headers['x-test-peer'] as string | undefined) ?? req.socket.remoteAddress;
  const home = createTrackerBridge(r, { env: {}, configDir, cwd: path.dirname(r), peer });
  const { signIn, header } = pairedSignIn({ root: r, configDir });
  const hub = createProjectsHub({
    home,
    openBridge: (p) => createTrackerBridge(p.root, { env: {}, configDir }),
    configDir,
    peer,
    signIn,
  });
  const srv = http.createServer((req, res) => void hub.handle(req, res));
  await new Promise<void>((done) => srv.listen(0, '127.0.0.1', done));
  const port = (srv.address() as { port: number }).port;
  // A phone paired as a device, and the browser on this machine.
  const phone = {
    'x-test-peer': '192.168.1.20',
    Host: `192.168.1.5:${port}`,
    ...sessionHeader(pairSession(signIn, { local: false })),
  };
  // Framed bodies: a DELETE's body without a length would be read as the next request.
  const hubCall = (o: Parameters<typeof raw>[0]) =>
    raw({ ...o, headers: { ...header, 'Content-Length': String(Buffer.byteLength(o.body ?? '')), ...o.headers } });
  try {
    // A second, registered project: its routes are held to the same list, checked in the hub itself.
    const otherRepo = path.dirname(tmp('remote-hub-other'));
    mkdirSync(path.join(otherRepo, '.teamtrail'), { recursive: true });
    const added = await hubCall({ port, method: 'POST', path: '/projects', body: JSON.stringify({ path: otherRepo }) });
    assert.equal(added.status, 201, added.text);
    const listed = JSON.parse((await hubCall({ port, path: '/projects' })).text) as {
      projects: { id: string; path: string }[];
    };
    const other = listed.projects.find((x) => x.id !== hub.homeId)!;
    assert.ok(other && path.isAbsolute(other.path));
    const seen = JSON.parse((await hubCall({ port, path: '/projects', headers: phone })).text) as {
      projects: { path: string }[];
    };
    assert.deepEqual(
      seen.projects.map((x) => path.isAbsolute(x.path)),
      seen.projects.map(() => false),
    );
    for (const [method, p] of [
      ['POST', '/projects'],
      ['PUT', '/projects/settings'],
      ['DELETE', `/projects/${hub.homeId}`],
      ['DELETE', `/projects/${other.id}`],
      ['POST', `/p/${hub.homeId}/remote-agents/tokens`],
      ['PUT', `/p/${hub.homeId}/policy`],
      ['PUT', `/p/${other.id}/policy`],
      ['POST', `/p/${other.id}/remote-agents/tokens`],
      ['GET', `/p/${other.id}/trackers/github/repos`],
      ['POST', `/p/${other.id}/guides/approve`],
    ]) {
      const res = await hubCall({ port, method, path: p, headers: phone, body: '{}' });
      assert.equal(res.status, 403, `${method} ${p} ${res.text}`);
      assert.equal(JSON.parse(res.text).elsewhere, true, `${method} ${p}`);
    }
    assert.equal((await hubCall({ port, path: '/projects', headers: phone })).status, 200);
    assert.equal((await hubCall({ port, path: `/p/${hub.homeId}/agents`, headers: phone })).status, 200);
  } finally {
    hub.close();
    home.close();
    srv.close();
  }
});

test('the list of this-machine-only routes, as the predicate reads it', () => {
  const only = (method: string, p: string) => thisMachineOnly(method, p);
  assert.equal(only('GET', '/remote-agents'), true);
  assert.equal(only('DELETE', '/projects/abc123'), true);
  assert.equal(only('POST', '/projects'), true);
  assert.equal(only('PUT', '/projects/settings'), true);
  assert.equal(only('POST', '/projects/abc123/answer'), false, 'answering from the overview stays open');
  assert.equal(only('GET', '/projects'), false);
  assert.equal(only('POST', '/guides/ticket'), true);
  assert.equal(only('POST', '/guides/ticketx'), true);
  assert.equal(only('POST', '/tracker/github/call'), false, 'the Lookout reads a GitHub tracker through this');
});

test('a real connection from a non-loopback address is another device (no test seam)', async (t) => {
  const external = Object.values(os.networkInterfaces())
    .flatMap((list) => list ?? [])
    .find((a) => a.family === 'IPv4' && !a.internal)?.address;
  // The socket's own view of both ends, with nothing injected.
  const seen: (string | undefined)[] = [];
  const probe = net.createServer((socket) => {
    seen.push(String(fromThisMachine({ socket } as http.IncomingMessage)));
    socket.end();
  });
  await new Promise<void>((done) => probe.listen(0, '0.0.0.0', done));
  const probePort = (probe.address() as net.AddressInfo).port;
  const dial = (host: string) =>
    new Promise<void>((done, fail) => {
      const c = net.connect(probePort, host);
      c.on('close', () => done());
      c.on('error', fail);
    });
  await dial('127.0.0.1');
  assert.deepEqual(seen, ['true']);
  if (!external) {
    probe.close();
    return t.skip('this machine has no non-loopback IPv4 address to connect from');
  }
  await dial(external);
  probe.close();
  assert.deepEqual(seen, ['true', 'false'], `a connection arriving from ${external} is not this machine`);

  // And through a real bridge with no seam: the same route, by loopback and by the LAN address.
  const r = tmp('remote-real-peer');
  mkdirSync(r, { recursive: true });
  const real = createTrackerBridge(r, { env: {}, cwd: path.dirname(r) });
  const srv = http.createServer((req, res) => void real.handle(req, res));
  await new Promise<void>((done) => srv.listen(0, '0.0.0.0', done));
  const port = (srv.address() as { port: number }).port;
  try {
    const viaLan = await fetch(`http://${external}:${port}/remote-agents`);
    assert.equal(viaLan.status, 403);
    assert.equal(((await viaLan.json()) as { elsewhere?: boolean }).elsewhere, true);
    assert.equal((await fetch(`http://${external}:${port}/agents`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/remote-agents`)).status, 200);
  } finally {
    real.close();
    srv.close();
  }
});

test('tests never reach for the credentials of whoever runs them', async () => {
  // The runner sets the switch and clears the shell's tokens (test/run.mjs); with it, `gh` is never asked.
  assert.equal(process.env[NO_GH_CLI_ENV], '1');
  for (const k of ['GITHUB_TOKEN', 'GH_TOKEN', 'LINEAR_API_KEY']) assert.ok(!process.env[k], k);
  assert.equal(await resolveGitHubToken({}, {}), null);
  // A test that brings its own `gh` still gets it called, and an explicit token in the given env still counts.
  assert.deepEqual(await resolveGitHubToken({}, {}, async () => 'ghp_fake'), { token: 'ghp_fake', source: 'gh' });
  assert.deepEqual(await resolveGitHubToken({}, { GITHUB_TOKEN: 'x' }), { token: 'x', source: 'GITHUB_TOKEN' });
});

test('links built from stored data are web links or nothing', () => {
  for (const ok of ['https://github.com/o/r/pull/3', 'http://localhost:7420/?project=ab12cd'])
    assert.equal(webUrl(ok), ok);
  for (const bad of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    'file:///etc/passwd',
    '//evil.example',
    'not a url',
    '',
    undefined,
    null,
  ])
    assert.equal(webUrl(bad), undefined, String(bad));
  assert.equal(webUrl('slack://open?team=T1', ['slack:']), 'slack://open?team=T1');
  assert.equal(webUrl('slack://open?team=T1'), undefined);
});

test('where a request comes from is read from the socket: loopback in every spelling, nothing else', () => {
  const from = (remoteAddress?: string) => fromThisMachine({ socket: { remoteAddress } } as http.IncomingMessage);
  for (const a of ['127.0.0.1', '127.0.0.53', '::1', '::ffff:127.0.0.1']) assert.equal(from(a), true, a);
  for (const a of ['192.168.1.20', '10.0.0.1', '::ffff:192.168.1.20', '2001:db8::1', '', undefined, '1127.0.0.1'])
    assert.equal(from(a), false, String(a));
});

test('routes: no other site can create or revoke, and an agent token is not a key to them', async () => {
  const made = await call('POST', '/remote-agents/tokens', { name: 'laptop' });
  const before = (await call('GET', '/remote-agents')).json.tokens.length;
  const bearer = { Authorization: `Bearer ${made.json.token}` };
  const crossSite = await call(
    'POST',
    '/remote-agents/tokens',
    { name: 'evil' },
    { ...bearer, Origin: 'http://evil.example' },
  );
  assert.equal(crossSite.status, 403);
  const form = await fetch(`${base}/remote-agents/tokens`, {
    method: 'POST',
    body: '{"name":"evil"}',
    headers: bearer,
  });
  assert.equal(form.status, 403, 'a form post (no JSON content type) is refused');
  const crossRevoke = await call(
    'POST',
    '/remote-agents/tokens/revoke',
    { id: made.json.created!.id },
    { ...bearer, Origin: 'http://evil.example' },
  );
  assert.equal(crossRevoke.status, 403);
  assert.equal((await call('GET', '/remote-agents')).json.tokens.length, before);
});

test('journal: old lines, new kinds and kinds from the future read side by side', () => {
  const r = tmp('remote-journal');
  const j = journalFile(r);
  const transition = {
    v: 1 as const,
    at: 1,
    mapId: REMOTE_AGENTS_JOURNAL,
    ticketId: '1',
    ticketKey: '#1',
    event: 'claim' as const,
    from: 'ready' as const,
    to: 'working' as const,
    actor: 'claude-01',
    actorKind: 'agent' as const,
  };
  mkdirSync(path.join(r, '.events'), { recursive: true });
  // the first journals had no `kind`
  appendFileSync(journalPath(r, REMOTE_AGENTS_JOURNAL), JSON.stringify(transition) + '\n');
  j.append({ ...transition, kind: 'transition', at: 2 });
  j.append({
    v: 1,
    kind: 'remote-agent',
    at: 3,
    mapId: REMOTE_AGENTS_JOURNAL,
    action: 'token-created',
    tokenId: 'rt_1',
    name: 'sandbox',
    actor: 'trail lead',
    actorKind: 'trail lead',
  });
  j.append({
    v: 1,
    kind: 'guide',
    at: 4,
    mapId: REMOTE_AGENTS_JOURNAL,
    action: 'approved',
    guide: 'qa',
    actor: 'trail lead',
    actorKind: 'trail lead',
  });
  appendFileSync(
    journalPath(r, REMOTE_AGENTS_JOURNAL),
    '{"v":1,"kind":"from-the-future","at":5,"mapId":"x"}\n{"torn":',
  );
  assert.deepEqual(
    j.read(REMOTE_AGENTS_JOURNAL).map((e) => e.at),
    [1, 2],
  );
  assert.deepEqual(
    j.readAll(REMOTE_AGENTS_JOURNAL).map((e) => e.at),
    [1, 2],
  );
  assert.deepEqual(
    j.readGuides(REMOTE_AGENTS_JOURNAL).map((e) => e.at),
    [4],
  );
  assert.deepEqual(
    j.readRemoteAgents(REMOTE_AGENTS_JOURNAL).map((e) => [e.at, e.action, e.name]),
    [[3, 'token-created', 'sandbox']],
  );
});

test('endpoints: listed while their process lives, the one made for sharing first', async () => {
  const r = tmp('remote-endpoints');
  assert.deepEqual(readMcpEndpoints(r), []);
  const release = writeMcpEndpoint(r, { url: 'http://localhost:7420/mcp', kind: 'lookout', network: false });
  const dir = path.join(r, '.agents', 'mcp-endpoints');
  // a server that crashed: its pid is gone
  writeFileSync(
    path.join(dir, '999999999.json'),
    JSON.stringify({ url: 'http://x/mcp', pid: 999999999, kind: 'standalone', network: true, startedAt: 1 }),
  );
  assert.deepEqual(
    readMcpEndpoints(r).map((e) => e.url),
    ['http://localhost:7420/mcp'],
  );
  release();
  assert.deepEqual(readdirSync(dir), ['999999999.json']);
  assert.deepEqual(readMcpEndpoints(r), []);
});

test('knowledge anchors: a path outside the repo is never read', () => {
  const repo = path.dirname(tmp('remote-anchors'));
  mkdirSync(path.join(repo, 'src'), { recursive: true });
  writeFileSync(path.join(repo, 'src', 'a.ts'), 'export {}');
  writeFileSync(path.join(path.dirname(repo), 'secret.txt'), 'outside');
  assert.match(blobHash(repo, 'src/a.ts') ?? '', /^[0-9a-f]{40}$/);
  assert.equal(blobHash(repo, '../secret.txt'), undefined);
  assert.equal(blobHash(repo, path.join(path.dirname(repo), 'secret.txt')), undefined);
  assert.equal(blobHash(repo, 'src/missing.ts'), undefined);
});

test('trail names: agents sharing one process each get their own, and give it back', () => {
  const r = tmp('remote-names-lock');
  const a = claimTrailName(r, 'claude', new Set(), 'holder-a');
  const b = claimTrailName(r, 'claude', new Set(), 'holder-b');
  assert.deepEqual([a, b], ['claude-01', 'claude-02']);
  assert.equal(claimTrailName(r, 'claude', new Set(), 'holder-a'), 'claude-01', 'asking again keeps the name');
  releaseTrailName(r, 'claude-01', 'holder-b');
  assert.equal(claimTrailName(r, 'claude', new Set(), 'holder-c'), 'claude-03', "another holder can't release it");
  releaseTrailName(r, 'claude-01', 'holder-a');
  assert.equal(claimTrailName(r, 'claude', new Set(), 'holder-d'), 'claude-01');
});
