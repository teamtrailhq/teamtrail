/** A fake Slack on this machine: `oauth.v2.access`, the Web API methods, and `response_url` hooks. */
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ApiCall {
  method: string;
  token: string;
  args: Record<string, unknown>;
}

export interface FakeSlack {
  url: string;
  calls: ApiCall[];
  hooks: { path: string; body: Record<string, unknown> }[];
  /** `oauth.v2.access` answers by code. */
  installs: Map<string, Record<string, unknown>>;
  /** Error codes to answer for a method. */
  failing: Map<string, string>;
  close(): Promise<void>;
}

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function parseArgs(req: IncomingMessage, text: string, url: URL): Record<string, unknown> {
  if (req.method === 'GET') return Object.fromEntries(url.searchParams);
  if (String(req.headers['content-type']).includes('json')) return JSON.parse(text || '{}');
  return Object.fromEntries(new URLSearchParams(text));
}

export async function fakeSlack(): Promise<FakeSlack> {
  const calls: ApiCall[] = [];
  const hooks: FakeSlack['hooks'] = [];
  const installs = new Map<string, Record<string, unknown>>();
  const failing = new Map<string, string>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const args = parseArgs(req, await body(req), url);
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.startsWith('/hooks/')) {
      hooks.push({ path: url.pathname, body: args });
      return res.end('{"ok":true}');
    }
    const method = url.pathname.replace(/^\/api\//, '');
    if (method === 'oauth.v2.access') {
      const answer = installs.get(String(args.code)) ?? { ok: false, error: 'invalid_code' };
      return res.end(JSON.stringify({ ...answer, _auth: req.headers.authorization }));
    }
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    calls.push({ method, token, args });
    const error = failing.get(method);
    res.end(JSON.stringify(error ? { ok: false, error } : { ok: true, method, ts: '1.000' }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    hooks,
    installs,
    failing,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
