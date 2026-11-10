import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { connectRemote } from '../src/connectRemote';
import { createMcpHttp } from '../src/mcp/http/createMcpHttp';
import { mcpHttpListener } from '../src/mcp/http/mcpHttpListener';
import { probeEndpoint } from '../src/probeEndpoint';

vi.mock('../commands/scout.md', () => ({ default: '# /scout' }));

let server: http.Server | undefined;
// connect writes the /scout prompt into the Codex home: never the real one.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-probe-'));
const realCodexHome = process.env.CODEX_HOME;
process.env.CODEX_HOME = path.join(home, 'codex');
afterEach(() => {
  server?.close();
  if (realCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = realCodexHome;
  fs.rmSync(home, { recursive: true, force: true });
});

// The server refuses a host name it wasn't told about with 403 "Host not allowed". `connect --url` used to call
// that "answered, but not like a Teamtrail MCP endpoint. Check the URL".
it('connect --url names a Host refusal and how to fix it', async () => {
  const mcp = createMcpHttp({
    auth: { authenticate: async () => undefined, snapshot: () => () => false },
    open: async () => undefined as never,
  });
  server = http.createServer(mcpHttpListener(mcp));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  // `localtest.me`-style names can't be relied on offline: send the Host header a tunnel would.
  const viaName: typeof fetch = (input, init) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        String(input),
        { method: init?.method, headers: { ...(init?.headers as Record<string, string>), Host: 'agents.example.com' } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode })));
        },
      );
      req.on('error', reject);
      req.end(init?.body as string | undefined);
    });
  vi.stubGlobal('fetch', viaName);
  try {
    expect(await probeEndpoint(`http://127.0.0.1:${port}/mcp`, 'tt_x')).toBe('host-refused');
  } finally {
    vi.unstubAllGlobals();
  }
  expect(await probeEndpoint(`http://127.0.0.1:${port}/mcp`, 'tt_x')).toBe('unauthorized');
  const lines: string[] = [];
  await connectRemote('codex', {
    cwd: home,
    url: 'https://agents.example.com/mcp',
    token: 'tt_x',
    print: (s) => lines.push(s),
    run: () => ({ status: 0, out: '', missing: false }),
    probe: async () => 'host-refused',
  });
  expect(lines.join('\n')).toMatch(/Endpoint\s+reachable, but it doesn't answer to this host name.*--allow-host/);
  await mcp.close();
});
