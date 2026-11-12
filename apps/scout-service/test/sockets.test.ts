/** The WebSocket's limits: the hello, sockets waiting for it, upgrades per address, messages per socket. */
import { afterEach, beforeEach, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { connect, linked, world, type World } from './harness';

let w: World;
beforeEach(async () => (w = await world()));
afterEach(() => w.close());

const open = (base: string) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/connect`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
const closedWith = (ws: WebSocket) => new Promise<number>((r) => ws.on('close', (code) => r(code)));

test('a hello over 4 KB is refused, even with a valid token in it', async () => {
  const { token } = await linked(w, { team: 'T1', user: 'U1' });
  const ws = await open(w.base);
  const closed = closedWith(ws);
  ws.send(JSON.stringify({ type: 'hello', token, pad: 'x'.repeat(5000) }));
  expect(await closed).toBe(4000);
});

test('sockets waiting for their hello are capped per address', async () => {
  const waiting = [];
  for (let i = 0; i < 10; i++) waiting.push(await open(w.base));
  const extra = await open(w.base);
  expect(await closedWith(extra)).toBe(1013);
  for (const ws of waiting) ws.close();
});

test('upgrades are rate limited per address', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 25 }, async () => {
      const ws = await open(w.base);
      ws.close();
    }),
  );
  expect(results.filter((r) => r.status === 'rejected').length).toBeGreaterThan(0);
});

test('after the hello, junk is dropped and the socket stays usable', async () => {
  const { token } = await linked(w, { team: 'T1', user: 'U1' });
  const c = await connect(w.base, token);
  c.ws.send('not json');
  c.ws.send(Buffer.from([1, 2, 3]));
  c.ws.send(JSON.stringify({ type: 'hello', token }));
  expect(await c.call('auth.test')).toMatchObject({ ok: true });
});

test('a flood of messages closes the socket too-fast', async () => {
  const { token } = await linked(w, { team: 'T1', user: 'U1' });
  const c = await connect(w.base, token);
  for (let i = 0; i < 150; i++) c.ws.send('{}');
  expect(await c.next((m) => m.type === 'closed')).toEqual({ type: 'closed', reason: 'too-fast' });
});

test('a message over the size cap closes the socket', async () => {
  const { token } = await linked(w, { team: 'T1', user: 'U1' });
  const c = await connect(w.base, token);
  c.ws.send('x'.repeat(600 * 1024));
  // 1009 (message too big), or 1006 when the server cuts the socket while the client is still sending.
  expect([1006, 1009]).toContain(await c.closed);
});

test('a third socket for one link replaces the oldest', async () => {
  const { token } = await linked(w, { team: 'T1', user: 'U1' });
  const a = await connect(w.base, token);
  await connect(w.base, token);
  await connect(w.base, token);
  expect(await a.next((m) => m.type === 'closed')).toEqual({ type: 'closed', reason: 'replaced' });
});

test('every answer carries Strict-Transport-Security', async () => {
  for (const path of ['/health', '/nope', '/install'])
    expect((await fetch(`${w.base}${path}`)).headers.get('strict-transport-security')).toContain('max-age=');
});
