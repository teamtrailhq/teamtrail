import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createProjectsHub, createTrackerBridge, type ProjectsHub, type TrackerBridge } from '../src/bridge';
import { registerProject } from '../src/projects/registerProject';

/* The second audit's low items on the bridge and the hub, each as the request that used to get through. */
let server: http.Server;
let bridge: TrackerBridge;
let hub: ProjectsHub;
let port: number;
let top: string;
let root: string;
let configDir: string;
const LAN = { 'x-test-peer': '192.168.1.20' };
const peer = (req: http.IncomingMessage) => (req.headers['x-test-peer'] as string | undefined) ?? '127.0.0.1';

before(async () => {
  top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-limits-'));
  root = path.join(top, 'repo', '.teamtrail');
  configDir = path.join(top, 'config');
  mkdirSync(path.join(root, 'trail', 'tickets'), { recursive: true });
  bridge = createTrackerBridge(root, { env: {}, configDir, cwd: path.dirname(root), peer });
  hub = createProjectsHub({
    home: bridge,
    openBridge: (p) => createTrackerBridge(p.root, { env: {}, configDir }),
    configDir,
    peer,
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

const call = async (method: string, p: string, body?: string, headers: Record<string, string> = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
  return { status: r.status, text: await r.text() };
};

test('a request body past 2 MiB is refused with 413, and the server keeps answering', async () => {
  // Said up front (Content-Length), or found out while reading (chunked): refused either way, before it's all in.
  // Over a raw socket: the server answers and closes early, so all that counts is the status line it sent.
  const send = (head: string, body: string) =>
    new Promise<number>((resolve) => {
      let text = '';
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(`PUT /file?path=trail/tickets/9.md HTTP/1.1\r\nHost: 127.0.0.1\r\n${head}\r\n\r\n`);
        socket.write(body, () => {});
      });
      socket.setTimeout(10_000, () => socket.destroy());
      socket.on('data', (c) => (text += c.toString('latin1')));
      socket.on('error', () => {});
      socket.on('close', () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0)));
    });
  assert.equal(await send(`Content-Length: ${3 * 1024 * 1024}`, 'x'), 413);
  const chunk = 'x'.repeat(1024 * 1024);
  const chunked = Array.from({ length: 3 }, () => `${chunk.length.toString(16)}\r\n${chunk}\r\n`).join('');
  // Chunked, the client is still sending when the server answers and closes, so whether it reads the 413 before
  // the reset is a race between the two sockets. What must hold either way: nothing written.
  assert.ok([413, 0].includes(await send('Transfer-Encoding: chunked', chunked)));
  assert.equal(existsSync(path.join(root, 'trail', 'tickets', '9.md')), false);
  assert.equal((await call('GET', '/list')).status, 200);
});

test('one address holds at most 16 event streams', async () => {
  const open: http.ClientRequest[] = [];
  const status = () =>
    new Promise<number>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => resolve(res.statusCode ?? 0));
      open.push(req);
    });
  const first = await Promise.all(Array.from({ length: 16 }, status));
  assert.ok(first.every((s) => s === 200));
  assert.equal(await status(), 429);
  for (const r of open) r.destroy();
  await new Promise((r) => setTimeout(r, 100));
  const again = await status();
  assert.equal(again, 200);
  for (const r of open) r.destroy();
});

test('/file follows no link out of the tracker, and writes through no link at all', async () => {
  const outside = path.join(top, 'secret.md');
  writeFileSync(outside, 'secret');
  symlinkSync(outside, path.join(root, 'trail', 'tickets', '7.md'));
  assert.equal((await call('GET', '/file?path=trail/tickets/7.md')).status, 400);
  assert.equal((await call('PUT', '/file?path=trail/tickets/7.md', 'pwned')).status, 400);
  assert.equal(readFileSync(outside, 'utf8'), 'secret');
  // a link that stays inside is still never written through
  writeFileSync(path.join(root, 'trail', 'tickets', '1.md'), 'one');
  symlinkSync(path.join(root, 'trail', 'tickets', '1.md'), path.join(root, 'trail', 'tickets', '8.md'));
  assert.equal((await call('PUT', '/file?path=trail/tickets/8.md', 'two')).status, 400);
  assert.equal(readFileSync(path.join(root, 'trail', 'tickets', '1.md'), 'utf8'), 'one');
});

test('guide catalogs are searched from this machine only: their URLs come from a file agents write', async () => {
  for (const p of ['/guides/catalog', '/guides/catalog/preview?id=x'])
    assert.equal((await call('GET', p, undefined, LAN)).status, 403, p);
});

test('/projects/<id>/answer takes only ids Teamtrail hands out, as /agents/answer does', async () => {
  const { entry } = registerProject({ configDir, root });
  for (const bad of ['../../x', 'a/b', '..', ''])
    assert.equal(
      (
        await call(
          'POST',
          `/projects/${entry.id}/answer`,
          JSON.stringify({ sessionId: bad, questionId: 'q1', text: 'y' }),
        )
      ).status,
      400,
      bad,
    );
  assert.equal(
    (
      await call(
        'POST',
        `/projects/${entry.id}/answer`,
        JSON.stringify({ sessionId: 's1', questionId: '../q', text: 'y' }),
      )
    ).status,
    400,
  );
});

test('the journal: the bridge says who made a transition, never the body', async () => {
  const entry = (actorKind: string, actor = 'claude-01') =>
    JSON.stringify({
      v: 1,
      kind: 'transition',
      at: 1,
      mapId: 'trail',
      ticketId: '1',
      ticketKey: '#1',
      actor,
      actorKind,
      event: 'claim',
      from: 'ready',
      to: 'working',
    });
  assert.equal((await call('POST', '/journal', entry('agent'))).status, 400);
  assert.equal((await call('POST', '/journal', entry('trail lead', 'somebody else'))).status, 200);
  assert.equal((await call('POST', '/journal', entry('trail lead', 'trail lead'), LAN)).status, 200);
  const lines = readFileSync(path.join(root, '.events', 'trail.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.deepEqual(
    lines.map((l) => l.actor),
    ['trail lead', 'trail lead (another device)'],
  );
});

test('a missing project tells another device nothing about where it was', async () => {
  const gone = path.join(top, 'gone', '.teamtrail');
  mkdirSync(gone, { recursive: true });
  const { entry } = registerProject({ configDir, root: gone });
  const { rmSync } = await import('node:fs');
  rmSync(path.dirname(gone), { recursive: true });
  const r = await call('GET', `/p/${entry.id}/list`, undefined, LAN);
  assert.equal(r.status, 404);
  assert.ok(!r.text.includes(top), r.text);
});
