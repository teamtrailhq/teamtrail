import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRemoteToken } from '@teamtrail/core/agents';
import { createLookoutSignIn, createProjectsHub, createTrackerBridge } from '@teamtrail/core/bridge';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { trackerFs } from '../../../apps/lookout/plugins/trackerFs';
import { createMcpHttp } from '../src/mcp/http/createMcpHttp';
import { mcpHttpListener } from '../src/mcp/http/mcpHttpListener';
import { remoteAgentOpener } from '../src/mcp/http/remoteAgentOpener';
import { tokenFileAuth } from '../src/mcp/http/tokenFileAuth';
import { keepServing } from '../src/serve/keepServing';
import { lookoutHandler } from '../src/serve/lookoutHandler';

/*
 * Every HTTP entry point Teamtrail has, sent the requests a well-behaved client never sends: request lines no
 * URL parser accepts, broken percent-encodings, huge headers, bodies that stop half way. Each must get an
 * answer (or a closed socket), and the server must go on answering afterwards: a request may never end the
 * process. Before the guard, `GET //` threw inside the request listener of all five.
 */
type Listener = (req: http.IncomingMessage, res: http.ServerResponse) => unknown;
interface Entry {
  name: string;
  /** Where its API lives: `/__teamtrail` on the Lookout's port, nothing on a bare bridge. */
  api: string;
  /** A request that is fine, and the status it gets. */
  sane: [string, number];
  listener: Listener;
}

let top: string;
let token: string;
const entries: Entry[] = [];
const closers: (() => unknown)[] = [];
const servers = new Map<string, { server: http.Server; port: number }>();
const uncaught: unknown[] = [];
const onUncaught = (e: unknown) => uncaught.push(e);

/** Raw bytes to the port; the status line's code, or 0 when the server only closed the socket. */
function send(port: number, bytes: string | Buffer, o: { abortAfterMs?: number } = {}) {
  return new Promise<number>((resolve) => {
    let text = '';
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(bytes);
      if (o.abortAfterMs !== undefined) setTimeout(() => socket.destroy(), o.abortAfterMs);
    });
    const done = () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0));
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('data', (c) => {
      text += c.toString('latin1');
      if (text.includes('\r\n\r\n')) socket.destroy();
    });
    socket.on('error', () => {});
    socket.on('close', done);
  });
}

const line = (requestLine: string, headers: string[] = [], body = '') =>
  `${requestLine} HTTP/1.1\r\n${['Host: 127.0.0.1', ...headers].join('\r\n')}\r\n\r\n${body}`;

/** Request lines that must be answered with a 4xx by the server itself (not a hang, not a crash). */
const malformed = (api: string) => [
  'GET //',
  'GET ///',
  'GET ///x',
  'GET http://evil.example/x',
  'GET https://evil.example/',
  `GET ${api}//`,
  `GET ${api}/p//`,
  'GET http://[::1',
  'GET /%E0%A4%A',
  'GET /%',
  `GET ${api}/%E0%A4%A`,
  `GET ${api}/file?path=%E0%A4%A.md`,
  `GET ${api}/p/%E0%A4%A/list`,
  `PUT ${api}/file?path=%ZZ`,
  'POST /mcp//',
  'GET /mcp/%E0%A4%A',
  'OPTIONS *',
  'GET /\\..\\..\\etc\\passwd',
  `GET /${'%2e%2e%2f'.repeat(40)}etc/passwd`,
];

type Middleware = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;

function dev(root: string, configDir: string): Listener {
  const stack: [string, Middleware][] = [];
  const httpServer = new EventEmitter();
  const use = (prefix: string | Middleware, fn?: Middleware) =>
    typeof prefix === 'function' ? stack.push(['', prefix]) : stack.push([prefix, fn!]);
  const fake = { httpServer, middlewares: { use } };
  const plugin = trackerFs({ root, prefix: '/__teamtrail', projectsConfigDir: configDir });
  (plugin.configureServer as (s: unknown) => void)(fake);
  closers.push(() => httpServer.emit('close'));
  // What connect does: each middleware in order; a mounted one only for its prefix, which it strips.
  return (req, res) => {
    const original = req.url ?? '/';
    const run = (i: number): void => {
      const layer = stack[i];
      if (!layer) return void ((res.statusCode = 404), res.end());
      const [prefix, fn] = layer;
      const mine = !prefix || original === prefix || original.startsWith(`${prefix}/`);
      if (!mine) return run(i + 1);
      req.url = original.slice(prefix.length) || '/';
      fn(req, res, () => run(i + 1));
    };
    run(0);
  };
}

beforeAll(async () => {
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUncaught);
  top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-fuzz-'));
  const root = path.join(top, 'repo', '.teamtrail');
  const appDir = path.join(top, 'app');
  const configDir = path.join(top, 'config');
  for (const d of [root, appDir, configDir]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html>lookout');
  token = createRemoteToken(root, 'fuzz').token;
  const bridge = createTrackerBridge(root, { env: {}, configDir, cwd: path.dirname(root) });
  const hub = createProjectsHub({
    home: bridge,
    openBridge: (p) => createTrackerBridge(p.root, { env: {}, configDir }),
    configDir,
    signIn: createLookoutSignIn({ root, configDir }),
  });
  const mcp = createMcpHttp({
    auth: tokenFileAuth(root),
    open: remoteAgentOpener({ root, version: '0.0.0-test', agent: { pollMs: 20 } }),
  });
  closers.push(
    () => mcp.close(),
    () => hub.close(),
    () => bridge.close(),
  );
  entries.push(
    {
      name: 'the Lookout server',
      api: '/__teamtrail',
      // the one API route a browser reaches before it is paired
      sane: ['GET /__teamtrail/session', 200],
      listener: lookoutHandler({ appDir, mcp, hub: () => hub }),
    },
    { name: 'the bridge', api: '', sane: ['GET /list', 200], listener: bridge.handle },
    { name: 'the projects hub', api: '', sane: ['GET /session', 200], listener: hub.handle },
    { name: 'mcp --http', api: '', sane: ['GET /nothing', 404], listener: mcpHttpListener(mcp) },
    {
      name: 'the dev plugin',
      api: '/__teamtrail',
      sane: ['GET /__teamtrail/session', 200],
      listener: dev(root, configDir),
    },
  );
  for (const e of entries) {
    // The listener exactly as each server mounts it: nothing here catches what it throws.
    const server = http.createServer((req, res) => void e.listener(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.set(e.name, { server, port: (server.address() as { port: number }).port });
  }
});

afterAll(async () => {
  for (const close of closers) await close();
  for (const { server } of servers.values()) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  process.off('uncaughtException', onUncaught);
  process.off('unhandledRejection', onUncaught);
  fs.rmSync(top, { recursive: true, force: true });
});

describe('malformed requests never end the process', () => {
  const names = ['the Lookout server', 'the bridge', 'the projects hub', 'mcp --http', 'the dev plugin'];

  it.each(names)('%s answers malformed request lines and bad percent-encodings', async (name) => {
    const entry = entries.find((e) => e.name === name)!;
    const { port } = servers.get(name)!;
    for (const requestLine of malformed(entry.api)) {
      const status = await send(port, line(requestLine));
      expect(status, `${name}: ${requestLine}`).toBeGreaterThanOrEqual(200);
      expect(status, `${name}: ${requestLine}`).toBeLessThan(500);
    }
    // Outside its two mounts the dev server is Vite's; inside them the same parser answers.
    const own =
      name === 'the dev plugin'
        ? [`GET ${entry.api}//`, `GET ${entry.api}///x`]
        : ['GET //', 'GET ///x', 'GET http://evil.example/x'];
    for (const exact of own) expect([await send(port, line(exact)), exact]).toEqual([400, exact]);
    expect(await send(port, line(entry.sane[0]))).toBe(entry.sane[1]);
    expect(uncaught).toEqual([]);
  });

  it.each(names)('%s survives huge headers, garbage and bodies that stop half way', async (name) => {
    const entry = entries.find((e) => e.name === name)!;
    const { port } = servers.get(name)!;
    const bearer = `Authorization: Bearer ${token}`;
    const json = 'Content-Type: application/json';
    // Node answers these two itself (431, 400); they are here so a change of server options can't lose that.
    expect(await send(port, line('GET /', [`X-Big: ${'a'.repeat(200_000)}`]))).toBe(431);
    expect(await send(port, Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00, 0x01, 0x00, 0x01, 0xfc, 0x03, 0x03]))).toBe(400);
    expect(await send(port, 'GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nBroken header line\r\n\r\n')).toBe(400);
    const half = [
      line(`PUT ${entry.api}/file?path=a/tickets/1.md`, ['Content-Length: 100000'], 'half a ticket'),
      line(`POST ${entry.api}/projects`, [json, 'Content-Length: 5000'], '{"path":"/tm'),
      line(`POST ${entry.api}/remote-agents/tokens`, [json, 'Content-Length: 5000'], '{"name":'),
      line(
        'POST /mcp',
        [json, bearer, 'Accept: application/json, text/event-stream', 'Content-Length: 5000'],
        '{"jsonrpc":"2.0",',
      ),
      line(`POST ${entry.api}/p/nope/answers`, [json, 'Transfer-Encoding: chunked'], 'ff\r\n{"half'),
      line('POST /mcp', [json, bearer, 'Transfer-Encoding: chunked'], 'zz\r\nnot hex'),
    ];
    for (const bytes of half) await send(port, bytes, { abortAfterMs: 30 });
    // Bodies that are whole but not what the route reads.
    for (const body of ['{', 'null', '[]', '"x"', '\u0000', '{"__proto__":{"x":1}}']) {
      const head = [json, `Content-Length: ${Buffer.byteLength(body)}`];
      for (const target of [`POST ${entry.api}/projects`, `PUT ${entry.api}/policy`, 'POST /mcp'])
        expect(await send(port, line(target, [...head, bearer], body)), `${name}: ${target} ${body}`).toBeLessThan(500);
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(await send(port, line(entry.sane[0]))).toBe(entry.sane[1]);
    expect(uncaught).toEqual([]);
  });

  it('an error nothing caught is logged and the process keeps serving', async () => {
    const before = { e: process.listeners('uncaughtException'), r: process.listeners('unhandledRejection') };
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    const lines: string[] = [];
    const stop = keepServing({ log: (l) => lines.push(l) });
    try {
      setTimeout(() => {
        throw new Error('thrown in a timer');
      }, 0);
      void Promise.reject(new Error('rejected nowhere'));
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      stop();
      for (const l of before.e) process.on('uncaughtException', l);
      for (const l of before.r) process.on('unhandledRejection', l);
    }
    expect(lines.join('')).toMatch(/Uncaught error \(still serving\): Error: thrown in a timer/);
    expect(lines.join('')).toMatch(/Unhandled rejection \(still serving\): Error: rejected nowhere/);
  });

  it.each(names)('%s never lets another site frame it, and never lets an API answer be cached', async (name) => {
    const entry = entries.find((e) => e.name === name)!;
    const { port } = servers.get(name)!;
    const head = await new Promise<http.IncomingHttpHeaders>((resolve, reject) =>
      http
        .get({ host: '127.0.0.1', port, path: entry.sane[0].slice(4) }, (res) => {
          res.resume();
          resolve(res.headers);
        })
        .on('error', reject),
    );
    expect(head['x-frame-options']).toBe('DENY');
    expect(head['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    if (name !== 'the dev plugin') {
      expect(head['x-content-type-options']).toBe('nosniff');
      expect(head['referrer-policy']).toBe('no-referrer');
      expect(head['cache-control']).toBe('no-store');
    }
  });

  it('errors that keep coming end the process with a clear message, so a restart recovers', () => {
    const lines: string[] = [];
    const exits: number[] = [];
    let now = 0;
    const stop = keepServing({
      log: (l) => lines.push(l),
      exit: (code) => void exits.push(code),
      now: () => now,
      handlers: false,
    });
    try {
      // Spread out, they are logged and the process keeps serving.
      for (let i = 0; i < 20; i++) {
        stop.report(new Error(`slow ${i}`));
        now += 10_000;
      }
      expect(exits).toEqual([]);
      // Ten in a minute: something is wrong for good.
      for (let i = 0; i < 10; i++) stop.report(new Error(`fast ${i}`));
      expect(exits).toEqual([1]);
      expect(lines.join('')).toMatch(/10 errors in a minute.*stopping so a restart recovers/s);
      expect(lines.join('')).toMatch(/Uncaught error \(still serving\): Error: slow 0/);
    } finally {
      stop();
    }
  });
});
