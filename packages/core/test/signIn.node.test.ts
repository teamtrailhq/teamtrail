import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { writeLookoutLock } from '../src/agents/lookoutLock';
import { createProjectsHub, createTrackerBridge, type ProjectsHub, type TrackerBridge } from '../src/bridge';
import { journalFile, journalPath } from '../src/history/journalFile';
import { machineStore } from '../src/machine/machineStore';
import { SIGN_IN_JOURNAL } from '../src/model/lifecycle';
import type { SignInView } from '../src/model/signIn';
import { instanceProven } from '../src/signIn/instanceProof';
import { createLookoutSignIn, type LookoutSignIn } from '../src/signIn/lookoutSignIn';
import { mintPairCode } from '../src/signIn/pairCodes';
import { runningLookout } from '../src/signIn/runningLookout';
import { SESSION_MS } from '../src/signIn/signInSessions';
import { SIGN_IN_FILE } from '../src/signIn/signInStore';
import { pairSession, sessionHeader } from './fakes/signedIn';

let top: string;
let root: string;
let configDir: string;
let bridge: TrackerBridge;
let signIn: LookoutSignIn;
let hub: ProjectsHub;
let server: http.Server;
let port: number;
let secret: string;
let mine: Record<string, string>;

const LAN_PEER = '192.168.1.20';
const peer = (req: http.IncomingMessage) => (req.headers['x-test-peer'] as string | undefined) ?? '127.0.0.1';
const lan = (address = LAN_PEER) => ({ 'x-test-peer': address, Host: `192.168.1.5:${port}` });

before(async () => {
  top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-sign-in-'));
  root = path.join(top, 'repo', '.teamtrail');
  configDir = path.join(top, 'config');
  process.env.TEAMTRAIL_CONFIG_DIR = configDir;
  mkdirSync(path.join(root, 'trail', 'tickets'), { recursive: true });
  bridge = createTrackerBridge(root, { env: {}, configDir, cwd: path.dirname(root), peer });
  signIn = createLookoutSignIn({ root, configDir, lanUrls: () => ['http://192.168.1.5:7420/'], sweepMs: 50 });
  hub = createProjectsHub({
    home: bridge,
    openBridge: (p) => createTrackerBridge(p.root, { env: {}, configDir }),
    configDir,
    peer,
    signIn,
  });
  server = http.createServer((req, res) => void hub.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
  secret = pairSession(signIn);
  mine = sessionHeader(secret);
});

after(() => {
  hub.close();
  bridge.close();
  server.closeAllConnections();
  server.close();
});

type Answer = { status: number; text: string; headers: http.IncomingHttpHeaders };
function call(o: { method?: string; path: string; headers?: Record<string, string>; body?: string }) {
  const method = o.method ?? 'GET';
  const body = method === 'GET' ? undefined : (o.body ?? '{}');
  return new Promise<Answer>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: o.path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(body)) }),
          ...o.headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text, headers: res.headers }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
const json = (a: Answer) => JSON.parse(a.text) as Record<string, unknown>;
const pairBody = (code: string) => JSON.stringify({ code });
const sessionFrom = (a: Answer) => sessionHeader(String(json(a).session));

test('every API route needs the session header: no cookie, no forged value, nothing else opens it', async () => {
  const routes: [string, string][] = [
    ['GET', '/list'],
    ['GET', '/file?path=trail/map.md'],
    ['GET', '/machine'],
    ['GET', '/agents'],
    ['GET', '/attention'],
    ['GET', '/projects'],
    ['GET', `/p/${hub.homeId}/list`],
    ['GET', '/events'],
    ['GET', `/p/${hub.homeId}/events`],
    ['GET', '/pair?code=x'],
    ['POST', '/agents/answer'],
    ['POST', '/verification/action'],
    ['PUT', '/policy'],
    ['POST', '/remote-agents/tokens'],
    ['POST', '/trust/approve'],
    ['GET', '/sign-in/sessions'],
    ['POST', '/sign-in/codes'],
    ['POST', '/sign-in/stream'],
    ['GET', '/nowhere'],
  ];
  // What a server on another port of this host would have had to steal or replay: a cookie. It opens nothing.
  const asCookie = { Cookie: `teamtrail_${hub.homeId}=${secret}; teamtrail_session=${secret}` };
  for (const [method, p] of routes) {
    for (const headers of [
      {},
      asCookie,
      sessionHeader('A'.repeat(43)),
      { 'X-Teamtrail-Session': `${secret}, ${secret}` },
    ]) {
      const res = await call({ method, path: p, headers });
      assert.equal(res.status, 401, `${method} ${p} ${JSON.stringify(headers).slice(0, 40)}`);
      assert.equal(json(res).signIn, 'required');
    }
  }
  for (const p of ['/list', '/machine', '/projects', `/p/${hub.homeId}/list`, '/sign-in/sessions'])
    assert.equal((await call({ path: p, headers: mine })).status, 200, p);
});

test('GET /session: anyone learns whether they are signed in; only this machine or a paired browser learns the project', async () => {
  assert.deepEqual(json(await call({ path: '/session' })), { signedIn: false, local: true, project: hub.homeId });
  assert.deepEqual(json(await call({ path: '/session', headers: lan() })), { signedIn: false, local: false });
  assert.deepEqual(json(await call({ path: '/session', headers: mine })), {
    signedIn: true,
    local: true,
    kind: 'machine',
    project: hub.homeId,
  });
});

test('GET /session?nonce= proves to this machine which Lookout process answers, signed with the machine key', async () => {
  const nonce = randomBytes(16).toString('hex');
  const out = json(await call({ path: `/session?nonce=${nonce}` }));
  assert.equal(out.instance, process.pid);
  assert.ok(instanceProven(root, process.pid, nonce, out.proof));
  assert.ok(!instanceProven(root, process.pid, `${nonce}0`, out.proof));
  assert.equal(json(await call({ path: `/session?nonce=${nonce}`, headers: lan() })).proof, undefined);
});

test('a link code pairs once, by POST from the Lookout page; the session comes back in the body, never a cookie', async () => {
  const { code } = signIn.mintCode('machine');
  const first = await call({ method: 'POST', path: '/pair', body: pairBody(code) });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.headers['set-cookie'], undefined);
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.equal(json(first).kind, 'machine');
  assert.match(String(json(first).session), /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await call({ path: '/list', headers: sessionFrom(first) })).status, 200);
  assert.equal((await call({ method: 'POST', path: '/pair', body: pairBody(code) })).status, 400);
  // another site can't complete it, nor a form post
  const { code: other } = signIn.mintCode('machine');
  const evil = { Origin: 'http://evil.example', Host: `127.0.0.1:${port}` };
  assert.equal((await call({ method: 'POST', path: '/pair', headers: evil, body: pairBody(other) })).status, 403);
  const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
  assert.equal((await call({ method: 'POST', path: '/pair', headers: form, body: `code=${other}` })).status, 403);
  assert.equal(
    (await call({ method: 'POST', path: '/pair', body: pairBody(other) })).status,
    200,
    'the code was never spent',
  );
});

test('a browser already signed in keeps its session: a code it is sent never replaces it', async () => {
  const before = signIn.views().length;
  const { code } = signIn.mintCode('machine');
  const res = await call({ method: 'POST', path: '/pair', headers: mine, body: pairBody(code) });
  assert.deepEqual(json(res), { ok: true, kind: 'machine' });
  assert.equal(signIn.views().length, before);
  assert.equal((await call({ method: 'POST', path: '/pair', body: pairBody(code) })).status, 400, 'spent');
});

test('a code made for another Lookout process is refused: a replayed lock gets nothing usable', async () => {
  const { code } = mintPairCode({ root, configDir, kind: 'machine', instance: process.pid + 1 });
  assert.equal((await call({ method: 'POST', path: '/pair', body: pairBody(code) })).status, 400);
  // and `teamtrail pair` for this process works at once, from another process's write
  const { code: right } = mintPairCode({ root, configDir, kind: 'machine', instance: process.pid });
  const ok = await call({ method: 'POST', path: '/pair', body: pairBody(right) });
  assert.equal((await call({ path: '/list', headers: sessionFrom(ok) })).status, 200);
});

test('codes expire, and the store keeps only hashes, private to this user', () => {
  let now = Date.now();
  const timed = createLookoutSignIn({ root, configDir, now: () => now });
  const req = { headers: {}, socket: {} } as unknown as http.IncomingMessage;
  try {
    const { code } = timed.mintCode('device');
    now += 5 * 60_000 + 1;
    assert.equal(timed.pair(req, { code, local: true, who: 'loopback' }).kind, 'refused');
  } finally {
    timed.close();
  }
  const { code } = signIn.mintCode('machine');
  const file = machineStore(root, configDir).file(SIGN_IN_FILE);
  const text = readFileSync(file, 'utf8');
  assert.ok(!text.includes(code));
  assert.ok(!text.includes(secret));
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('wrong typed codes hold back that caller only; links and malformed input are never held', () => {
  const t = createLookoutSignIn({ root, configDir });
  const req = { headers: {}, socket: {} } as unknown as http.IncomingMessage;
  const pair = (code: unknown, who: string, local = false) => t.pair(req, { code, local, who }).kind;
  try {
    // empty and malformed input: refused, counted against nobody
    for (let i = 0; i < 50; i++) for (const junk of [undefined, '', 'x', '%%%', 'A'.repeat(64)]) pair(junk, LAN_PEER);
    assert.equal(pair(t.mintCode('device').code, LAN_PEER), 'paired');
    // five wrong typed codes from one device: its typed codes wait
    for (let i = 0; i < 5; i++) assert.equal(pair('ZZZZ-ZZZZ', LAN_PEER), 'refused');
    assert.equal(pair(t.mintCode('device').code, LAN_PEER), 'locked');
    // ...not anyone else's, and never a link's 256-bit code
    assert.equal(pair(t.mintCode('device').code, '192.168.1.21'), 'paired');
    assert.equal(pair(t.mintCode('device').code, 'loopback', true), 'paired');
    assert.equal(pair(t.mintCode('machine').code, LAN_PEER), 'paired');
    // a local program guessing can't lock out a link the CLI printed
    for (let i = 0; i < 20; i++) pair('ZZZZ-ZZZZ', 'loopback', true);
    assert.equal(pair(t.mintCode('machine').code, 'loopback', true), 'paired');
  } finally {
    t.close();
  }
});

test('over HTTP: 429 with Retry-After for the caller that guessed, and loopback keeps its own budget', async () => {
  const guesser = lan('192.168.1.77');
  for (let i = 0; i < 5; i++)
    await call({ method: 'POST', path: '/pair', headers: guesser, body: pairBody('ZZZZ-ZZZZ') });
  const locked = await call({ method: 'POST', path: '/pair', headers: guesser, body: pairBody('ZZZZ-ZZZZ') });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers['retry-after']) > 0);
  const { code } = signIn.mintCode('device');
  assert.equal((await call({ method: 'POST', path: '/pair', body: pairBody(code) })).status, 200);
});

test('another device pairs with a typed code: it reads and answers, never what only this machine may do', async () => {
  const codes = await call({ method: 'POST', path: '/sign-in/codes', headers: mine });
  assert.equal(codes.status, 200);
  const { code, links, expiresAt } = json(codes) as { code: string; links: string[]; expiresAt: number };
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(expiresAt > Date.now() && expiresAt <= Date.now() + 5 * 60_000);
  // the code rides in the fragment: no server, log or Referer gets it
  assert.deepEqual(links, [`http://192.168.1.5:7420/#pair=${code.replace('-', '')}`]);
  const phone = {
    ...lan(),
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1',
  };
  const paired = await call({ method: 'POST', path: '/pair', headers: phone, body: pairBody(code.toLowerCase()) });
  assert.equal(paired.status, 200, paired.text);
  assert.equal(json(paired).kind, 'device');
  const device = sessionFrom(paired);
  assert.equal((await call({ path: '/list', headers: { ...phone, ...device } })).status, 200);
  // its session, even sent from this machine, is a device's
  for (const headers of [{ ...phone, ...device }, device]) {
    for (const [method, p] of [
      ['GET', '/sign-in/sessions'],
      ['POST', '/sign-in/codes'],
      ['POST', '/remote-agents/tokens'],
      ['PUT', '/policy'],
    ]) {
      const res = await call({ method, path: p, headers });
      assert.equal(res.status, 403, `${method} ${p}`);
      assert.equal(json(res).elsewhere, true);
    }
    assert.deepEqual(json(await call({ path: '/machine', headers })), { local: false });
  }
  const listed = json(await call({ path: '/sign-in/sessions', headers: mine })) as { sessions: SignInView[] };
  assert.equal(listed.sessions.find((s) => s.name === 'Safari on iPhone')?.kind, 'device');
  assert.equal(listed.sessions[0].current, true);
});

test('a link code used from another device pairs a device', async () => {
  const { code } = signIn.mintCode('machine');
  const res = await call({ method: 'POST', path: '/pair', headers: lan(), body: pairBody(code) });
  assert.equal(json(res).kind, 'device');
});

test('event streams open with a single-use ticket; revoking a browser ends its stream; signing out ends a session', async () => {
  const other = sessionHeader(pairSession(signIn, { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0' }));
  const ticketOf = async (h: Record<string, string>) =>
    String(json(await call({ method: 'POST', path: '/sign-in/stream', headers: h })).ticket);
  const ticket = await ticketOf(other);
  const ended = new Promise<void>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: `/events?ticket=${ticket}` }, (res) => {
      assert.equal(res.statusCode, 200);
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.end();
  });
  // used once
  assert.equal((await call({ path: `/events?ticket=${ticket}` })).status, 401);
  assert.equal(
    (await call({ path: `/list?ticket=${await ticketOf(other)}` })).status,
    401,
    'a ticket opens streams only',
  );
  const { sessions } = json(await call({ path: '/sign-in/sessions', headers: mine })) as { sessions: SignInView[] };
  const target = sessions.find((s) => s.name === 'Firefox on Linux')!;
  const revoked = await call({
    method: 'POST',
    path: '/sign-in/revoke',
    headers: mine,
    body: JSON.stringify({ id: target.id }),
  });
  assert.equal(revoked.status, 200);
  await ended;
  assert.equal((await call({ path: '/list', headers: other })).status, 401);
  const leaving = sessionHeader(pairSession(signIn));
  assert.equal((await call({ method: 'POST', path: '/sign-in/sign-out', headers: leaving })).status, 200);
  assert.equal((await call({ path: '/list', headers: leaving })).status, 401);
  assert.equal((await call({ path: '/list', headers: mine })).status, 200);
});

test('a session stays while it is used and ends 30 days after it last was', () => {
  let now = Date.now();
  const timed = createLookoutSignIn({ root, configDir, now: () => now });
  try {
    const req = { headers: sessionHeaderLower(pairSession(timed)), socket: {} } as unknown as http.IncomingMessage;
    now += SESSION_MS - 60_000;
    assert.equal(timed.check(req).kind, 'signed-in');
    now += SESSION_MS - 60_000;
    assert.equal(timed.check(req).kind, 'signed-in');
    now += SESSION_MS + 1;
    assert.equal(timed.check(req).kind, 'signed-out');
  } finally {
    timed.close();
  }
});

/** Node lower-cases the names of the headers it receives. */
const sessionHeaderLower = (s: string) => ({ 'x-teamtrail-session': s });

test('pairing, device codes and revoking are journaled without a secret; old journals still load', () => {
  const file = journalPath(root, SIGN_IN_JOURNAL);
  appendFileSync(file, '{"v":1,"at":1,"mapId":"_sign-in","kind":"from-a-newer-version"}\n');
  const entries = journalFile(root).readSignIn(SIGN_IN_JOURNAL);
  const actions = new Set(entries.map((e) => e.action));
  for (const a of ['paired', 'device-code', 'revoked', 'signed-out']) assert.ok(actions.has(a as never), a);
  const text = readFileSync(file, 'utf8');
  assert.ok(!text.includes(secret));
  assert.ok(!/"hash"/.test(text));
  assert.deepEqual(journalFile(root).readAll(SIGN_IN_JOURNAL), []);
});

test('`teamtrail pair` trusts a lock only when its process is alive and the server there proves it is that process', async () => {
  const at = `http://localhost:${port}/`;
  // this test's hub answers without the Lookout's `/__teamtrail` prefix
  const unprefixed: typeof fetch = (u, init) => fetch(String(u).replace('/__teamtrail', ''), init);
  const release = writeLookoutLock(root, at);
  try {
    assert.deepEqual(await runningLookout(root, unprefixed), { kind: 'running', url: at, instance: process.pid });
    // an agent's server on the lock's port: alive pid, signed lock, but no proof
    const fake = http.createServer((_req, res) =>
      res.end(JSON.stringify({ signedIn: false, instance: process.pid, proof: 'f'.repeat(64) })),
    );
    await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
    const fakeUrl = `http://localhost:${(fake.address() as { port: number }).port}/`;
    writeLookoutLock(root, fakeUrl);
    assert.equal((await runningLookout(root, unprefixed)).kind, 'not-answering');
    fake.close();
    // an old signed lock of a process that is gone
    const lockFile = path.join(root, '.agents', 'server.json');
    const old = JSON.parse(readFileSync(lockFile, 'utf8')) as Record<string, unknown>;
    writeFileSync(lockFile, JSON.stringify({ ...old, pid: 999_999 }));
    assert.equal((await runningLookout(root)).kind, 'none');
  } finally {
    release();
  }
});
