import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createProjectsHub, createTrackerBridge, type ProjectsHub, type TrackerBridge } from '../src/bridge';
import { journalFile, journalPath } from '../src/history/journalFile';
import { machineStore } from '../src/machine/machineStore';
import { SIGN_IN_JOURNAL } from '../src/model/lifecycle';
import type { SignInView } from '../src/model/signIn';
import { createLookoutSignIn, type LookoutSignIn } from '../src/signIn/lookoutSignIn';
import { mintPairCode } from '../src/signIn/pairCodes';
import { cookieName } from '../src/signIn/signInCookie';
import { SESSION_MS } from '../src/signIn/signInSessions';
import { SIGN_IN_FILE } from '../src/signIn/signInStore';
import { pairCookie } from './fakes/signedIn';

let top: string;
let root: string;
let configDir: string;
let bridge: TrackerBridge;
let signIn: LookoutSignIn;
let hub: ProjectsHub;
let server: http.Server;
let port: number;
let cookie: string;

const LAN_PEER = '192.168.1.20';
const peer = (req: http.IncomingMessage) => (req.headers['x-test-peer'] as string | undefined) ?? '127.0.0.1';

before(async () => {
  top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-sign-in-'));
  root = path.join(top, 'repo', '.teamtrail');
  configDir = path.join(top, 'config');
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
  cookie = pairCookie(signIn);
});

after(() => {
  hub.close();
  bridge.close();
  server.closeAllConnections();
  server.close();
});

type Answer = { status: number; text: string; headers: http.IncomingHttpHeaders };
function call(o: { method?: string; path: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<Answer>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: o.path,
        method: o.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...o.headers },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text, headers: res.headers }));
      },
    );
    req.on('error', reject);
    req.end((o.method ?? 'GET') === 'GET' ? undefined : o.body);
  });
}
const json = (a: Answer) => JSON.parse(a.text) as Record<string, unknown>;
const cookieOf = (a: Answer) => String(a.headers['set-cookie']?.[0] ?? '').split(';')[0];

test('every API route needs a paired browser: reads, writes, the event stream and other projects', async () => {
  const routes: [string, string][] = [
    ['GET', '/list'],
    ['GET', '/file?path=trail/map.md'],
    ['GET', '/machine'],
    ['GET', '/agents'],
    ['GET', '/attention'],
    ['GET', '/projects'],
    ['GET', `/p/${hub.homeId}/list`],
    ['GET', '/events'],
    ['POST', '/agents/answer'],
    ['POST', '/verification/action'],
    ['PUT', '/policy'],
    ['POST', '/remote-agents/tokens'],
    ['POST', '/trust/approve'],
    ['GET', '/sign-in/sessions'],
    ['POST', '/sign-in/codes'],
    ['GET', '/nowhere'],
  ];
  for (const [method, p] of routes) {
    const res = await call({ method, path: p, body: '{}' });
    assert.equal(res.status, 401, `${method} ${p} ${res.text}`);
    assert.equal(json(res).signIn, 'required', `${method} ${p}`);
    // a cookie that is no session is no better
    const forged = await call({
      method,
      path: p,
      body: '{}',
      headers: { Cookie: `${signIn.cookieName}=${'A'.repeat(43)}` },
    });
    assert.equal(forged.status, 401, `${method} ${p} (forged)`);
  }
  for (const p of ['/list', '/machine', '/projects', `/p/${hub.homeId}/list`, '/sign-in/sessions'])
    assert.equal((await call({ path: p, headers: { Cookie: cookie } })).status, 200, p);
});

test('GET /session answers anyone, and says whether this browser is signed in and which project this is', async () => {
  const out = json(await call({ path: '/session' }));
  assert.deepEqual(out, { signedIn: false, local: true, project: hub.homeId });
  const signedIn = json(await call({ path: '/session', headers: { Cookie: cookie } }));
  assert.deepEqual(signedIn, { signedIn: true, local: true, project: hub.homeId, kind: 'machine' });
});

test('a pairing link works once: cookie set, sent on to the Lookout, never twice', async () => {
  const { code } = signIn.mintCode('machine');
  const first = await call({ path: `/pair?code=${code}&next=?settings=slack` });
  assert.equal(first.status, 303);
  assert.equal(first.headers.location, '/?settings=slack');
  assert.equal(first.headers['referrer-policy'], 'no-referrer');
  assert.equal(first.headers['cache-control'], 'no-store');
  const set = String(first.headers['set-cookie']?.[0]);
  assert.match(set, new RegExp(`^${signIn.cookieName}=[A-Za-z0-9_-]{43}; `));
  for (const attr of ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_MS / 1000}`])
    assert.ok(set.includes(attr), attr);
  assert.ok(!set.includes('Secure'), 'plain http on localhost: no Secure flag');
  assert.equal((await call({ path: '/list', headers: { Cookie: cookieOf(first) } })).status, 200);
  const again = await call({ path: `/pair?code=${code}` });
  assert.equal(again.status, 303);
  assert.equal(again.headers.location, '/?pair=used');
  assert.equal(again.headers['set-cookie'], undefined);
  // only a query for the Lookout's own page: never another path or site
  const { code: other } = signIn.mintCode('machine');
  const away = await call({ path: `/pair?code=${other}&next=//evil.example/` });
  assert.equal(away.headers.location, '/');
});

test('a browser already signed in that opens another link keeps its session; the code is spent', async () => {
  const before = signIn.views().length;
  const { code } = signIn.mintCode('machine');
  const res = await call({ path: `/pair?code=${code}`, headers: { Cookie: cookie } });
  assert.equal(res.status, 303);
  assert.equal(res.headers['set-cookie'], undefined);
  assert.equal(signIn.views().length, before);
  assert.equal(
    json(await call({ method: 'POST', path: '/pair', body: JSON.stringify({ code }) })).error !== undefined,
    true,
  );
});

test('codes expire, and the store keeps only hashes, private to this user', () => {
  let now = Date.now();
  const timed = createLookoutSignIn({ root, configDir, now: () => now });
  try {
    const { code } = timed.mintCode('device');
    now += 5 * 60_000 + 1;
    const req = { headers: {}, socket: {} } as unknown as http.IncomingMessage;
    assert.equal(timed.pair(req, { code, local: true }).kind, 'refused');
  } finally {
    timed.close();
  }
  const { code } = signIn.mintCode('machine');
  const file = machineStore(root, configDir).file(SIGN_IN_FILE);
  const text = readFileSync(file, 'utf8');
  assert.ok(!text.includes(code));
  assert.ok(!text.includes(cookie.split('=')[1]));
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('wrong codes lock pairing for a minute, even for a right code', async () => {
  let now = Date.now();
  const timed = createLookoutSignIn({ root, configDir, now: () => now });
  const req = { headers: {}, socket: {} } as unknown as http.IncomingMessage;
  try {
    for (let i = 0; i < 5; i++) assert.equal(timed.pair(req, { code: 'WRONG-CODE', local: true }).kind, 'refused');
    const { code } = timed.mintCode('device');
    assert.equal(timed.pair(req, { code, local: true }).kind, 'locked');
    now += 61_000;
    assert.equal(timed.pair(req, { code, local: true }).kind, 'paired');
  } finally {
    timed.close();
  }
  // over HTTP: 429 with Retry-After
  const fresh = createLookoutSignIn({ root, configDir });
  try {
    for (let i = 0; i < 5; i++) fresh.pair(req, { code: 'ABCD-EFGH', local: true });
    assert.equal(fresh.pair(req, { code: 'ABCD-EFGH', local: true }).kind, 'locked');
  } finally {
    fresh.close();
  }
});

test('a cookie name sent twice is refused, not guessed', async () => {
  const value = cookie.split('=')[1];
  const res = await call({ path: '/list', headers: { Cookie: `${cookie}; ${signIn.cookieName}=${value}` } });
  assert.equal(res.status, 401);
  assert.equal(json(res).signIn, 'ambiguous');
  // another Lookout's cookie (another project) is simply not ours
  assert.notEqual(cookieName(path.join(top, 'other', '.teamtrail')), signIn.cookieName);
  assert.equal((await call({ path: '/list', headers: { Cookie: `teamtrail_0123456789=x; ${cookie}` } })).status, 200);
});

test('another device pairs with a typed code: it reads and answers, never what only this machine may do', async () => {
  const codes = await call({ method: 'POST', path: '/sign-in/codes', headers: { Cookie: cookie } });
  assert.equal(codes.status, 200);
  const { code, links, expiresAt } = json(codes) as { code: string; links: string[]; expiresAt: number };
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(expiresAt > Date.now() && expiresAt <= Date.now() + 5 * 60_000);
  assert.deepEqual(links, [`http://192.168.1.5:7420/__teamtrail/pair?code=${code.replace('-', '')}`]);
  const phone = {
    'x-test-peer': LAN_PEER,
    Host: `192.168.1.5:${port}`,
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  };
  const paired = await call({
    method: 'POST',
    path: '/pair',
    headers: phone,
    body: JSON.stringify({ code: code.toLowerCase() }),
  });
  assert.equal(paired.status, 200, paired.text);
  assert.deepEqual(json(paired), { ok: true, kind: 'device' });
  const device = cookieOf(paired);
  assert.equal((await call({ path: '/list', headers: { ...phone, Cookie: device } })).status, 200);
  // its cookie, even sent from this machine, is a device's
  for (const headers of [{ ...phone, Cookie: device }, { Cookie: device }]) {
    for (const [method, p] of [
      ['GET', '/sign-in/sessions'],
      ['POST', '/sign-in/codes'],
      ['POST', '/remote-agents/tokens'],
      ['PUT', '/policy'],
    ]) {
      const res = await call({ method, path: p, headers, body: '{}' });
      assert.equal(res.status, 403, `${method} ${p}`);
      assert.equal(json(res).elsewhere, true);
    }
    assert.deepEqual(json(await call({ path: '/machine', headers })), { local: false });
  }
  const listed = json(await call({ path: '/sign-in/sessions', headers: { Cookie: cookie } })) as {
    sessions: SignInView[];
  };
  const row = listed.sessions.find((s) => s.name === 'Safari on iPhone');
  assert.equal(row?.kind, 'device');
  assert.equal(listed.sessions.filter((s) => s.current).length, 1);
});

test('a link printed for this machine, opened on another device, pairs a device', async () => {
  const { code } = signIn.mintCode('machine');
  const res = await call({
    path: `/pair?code=${code}`,
    headers: { 'x-test-peer': LAN_PEER, Host: `192.168.1.5:${port}` },
  });
  const session = json(
    await call({
      path: '/session',
      headers: { Cookie: cookieOf(res), 'x-test-peer': LAN_PEER, Host: `192.168.1.5:${port}` },
    }),
  );
  assert.equal(session.kind, 'device');
});

test('`teamtrail pair` adds a code from another process: the running Lookout takes it at once', async () => {
  const { code } = mintPairCode({ root, configDir, kind: 'machine' });
  const res = await call({ path: `/pair?code=${code}` });
  assert.equal(res.headers.location, '/');
  assert.equal((await call({ path: '/list', headers: { Cookie: cookieOf(res) } })).status, 200);
});

test('revoking a browser signs it out and ends its event stream; signing out clears the cookie', async () => {
  const other = pairCookie(signIn, { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0' });
  const ended = new Promise<void>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/events', headers: { Cookie: other } }, (res) => {
      assert.equal(res.statusCode, 200);
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.end();
  });
  const { sessions } = json(await call({ path: '/sign-in/sessions', headers: { Cookie: cookie } })) as {
    sessions: SignInView[];
  };
  const target = sessions.find((s) => s.name === 'Firefox on Linux')!;
  const revoked = await call({
    method: 'POST',
    path: '/sign-in/revoke',
    headers: { Cookie: cookie },
    body: JSON.stringify({ id: target.id }),
  });
  assert.equal(revoked.status, 200);
  await ended;
  assert.equal((await call({ path: '/list', headers: { Cookie: other } })).status, 401);
  // signing out: this browser only
  const mine = pairCookie(signIn);
  const out = await call({ method: 'POST', path: '/sign-in/sign-out', headers: { Cookie: mine }, body: '{}' });
  assert.equal(out.status, 200);
  assert.match(String(out.headers['set-cookie']?.[0]), /Max-Age=0/);
  assert.equal((await call({ path: '/list', headers: { Cookie: mine } })).status, 401);
  assert.equal((await call({ path: '/list', headers: { Cookie: cookie } })).status, 200);
});

test('a session stays while it is used and ends 30 days after it last was', () => {
  let now = Date.now();
  const timed = createLookoutSignIn({ root, configDir, now: () => now });
  try {
    const c = pairCookie(timed);
    const req = { headers: { cookie: c }, socket: {} } as unknown as http.IncomingMessage;
    now += SESSION_MS - 60_000;
    const used = timed.check(req);
    assert.equal(used.kind, 'signed-in');
    assert.ok(used.kind === 'signed-in' && used.renew?.includes('Max-Age='), 'the browser gets the cookie again');
    now += SESSION_MS - 60_000;
    assert.equal(timed.check(req).kind, 'signed-in');
    now += SESSION_MS + 1;
    assert.equal(timed.check(req).kind, 'signed-out');
  } finally {
    timed.close();
  }
});

test('pairing, device codes and revoking are journaled without a secret; old journals still load', () => {
  const file = journalPath(root, SIGN_IN_JOURNAL);
  appendFileSync(file, '{"v":1,"at":1,"mapId":"_sign-in","kind":"from-a-newer-version"}\n');
  const entries = journalFile(root).readSignIn(SIGN_IN_JOURNAL);
  const actions = new Set(entries.map((e) => e.action));
  for (const a of ['paired', 'device-code', 'revoked', 'signed-out']) assert.ok(actions.has(a as never), a);
  const text = readFileSync(file, 'utf8');
  assert.ok(!text.includes(cookie.split('=')[1]));
  assert.ok(!/"hash"/.test(text));
  assert.deepEqual(journalFile(root).readAll(SIGN_IN_JOURNAL), []);
});

test('wrong codes over HTTP: 429 with Retry-After', async () => {
  for (let i = 0; i < 6; i++)
    await call({ method: 'POST', path: '/pair', body: JSON.stringify({ code: 'ZZZZ-ZZZZ' }) });
  const locked = await call({ method: 'POST', path: '/pair', body: JSON.stringify({ code: 'ZZZZ-ZZZZ' }) });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers['retry-after']) > 0);
  const link = await call({ path: '/pair?code=ZZZZZZZZ' });
  assert.equal(link.headers.location, '/?pair=wait');
});
