import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRemoteToken, remoteTokenViews, verifyRemoteToken } from '@teamtrail/core/agents';
import { createProjectsHub, createTrackerBridge, type ProjectsHub, type TrackerBridge } from '@teamtrail/core/bridge';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpHttp } from '../src/mcp/http/createMcpHttp';
import { remoteAgentOpener } from '../src/mcp/http/remoteAgentOpener';
import { tokenFileAuth } from '../src/mcp/http/tokenFileAuth';
import type { McpHttp } from '../src/mcp/http/types';
import { lookoutHandler } from '../src/serve/lookoutHandler';
import { pairedSignIn } from './fakes/signedIn';

/*
 * The Lookout's port as `teamtrail` serves it: the app, the bridge (behind sign-in) and /mcp, together.
 * These are the attacks a security review ran against that port, each as a request that used to get a 200.
 */
let top: string;
let root: string;
let server: http.Server;
let bridge: TrackerBridge;
let hub: ProjectsHub;
let mcp: McpHttp;
let port: number;
let token: string;
let cookie: string;

/** The socket's address in production; here a header stands in for another device on the network. */
const peer = (req: http.IncomingMessage) =>
  (req.headers['x-test-peer'] as string | undefined) ?? req.socket.remoteAddress;

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'raw', version: '1' } },
};

function raw(o: { method?: string; path: string; headers?: Record<string, string>; body?: unknown }) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: o.path,
        method: o.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Cookie: cookie,
          ...o.headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          text += c;
          if (text.includes('\n\n')) res.destroy();
        });
        res.on('close', () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on('error', reject);
    req.end(o.body === undefined ? undefined : typeof o.body === 'string' ? o.body : JSON.stringify(o.body));
  });
}

beforeEach(async () => {
  top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-mount-'));
  root = path.join(top, 'repo', '.teamtrail');
  const appDir = path.join(top, 'app');
  const configDir = path.join(top, 'config');
  for (const d of [root, appDir, configDir]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html>lookout');
  bridge = createTrackerBridge(root, { env: {}, configDir, cwd: path.dirname(root), peer });
  const paired = pairedSignIn({ root, configDir });
  cookie = paired.cookie;
  hub = createProjectsHub({
    home: bridge,
    openBridge: (p) => createTrackerBridge(p.root, { env: {}, configDir }),
    configDir,
    peer,
    signIn: paired.signIn,
  });
  mcp = createMcpHttp({
    auth: tokenFileAuth(root),
    open: remoteAgentOpener({ root, version: '0.0.0-test', agent: { pollMs: 20 } }),
    thisMachineOnly: true,
    peer,
  });
  server = http.createServer(lookoutHandler({ appDir, mcp, hub: () => hub }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
  token = createRemoteToken(root, 'sandbox').token;
});
afterEach(async () => {
  await mcp.close();
  hub.close();
  bridge.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(top, { recursive: true, force: true });
});

describe('the Lookout port: bridge and /mcp together', () => {
  const bearer = () => ({ Authorization: `Bearer ${token}` });

  it('serves the app, the bridge and /mcp to this machine', async () => {
    expect((await raw({ path: '/' })).text).toContain('lookout');
    expect((await raw({ path: '/__teamtrail/remote-agents' })).status).toBe(200);
    expect((await raw({ method: 'POST', path: '/mcp', headers: bearer(), body: initialize })).status).toBe(200);
  });

  it('a page rebinding its domain to this port gets nothing: no token, no file, no MCP', async () => {
    const shapes: Record<string, string>[] = [
      { Host: 'trail.example.com' },
      { Host: 'evil.example:7420', Origin: 'http://evil.example:7420' },
    ];
    for (const headers of shapes) {
      const attempts = [
        await raw({ method: 'POST', path: '/__teamtrail/remote-agents/tokens', headers, body: { name: 'evil' } }),
        await raw({ method: 'PUT', path: '/__teamtrail/file?path=verification.json', headers, body: '{"v":1}' }),
        await raw({ method: 'PUT', path: '/__teamtrail/file?path=.agents/remote-tokens.json', headers, body: '{}' }),
        await raw({ path: '/__teamtrail/projects', headers }),
        await raw({ method: 'POST', path: '/mcp', headers: { ...headers, ...bearer() }, body: initialize }),
      ];
      expect(attempts.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    }
    expect(remoteTokenViews(root).map((t) => t.name)).toEqual(['sandbox']);
    expect(fs.existsSync(path.join(root, 'verification.json'))).toBe(false);
    expect(verifyRemoteToken(root, token)).toBeTruthy();
  });

  it('an agent token is no key to the bridge: it cannot mint tokens, read the token file or write a check', async () => {
    const h = bearer();
    const file = (p: string, method = 'GET') =>
      raw({
        method,
        path: `/__teamtrail/file?path=${encodeURIComponent(p)}`,
        headers: h,
        body: method === 'PUT' ? '{}' : undefined,
      });
    expect((await file('.agents/remote-tokens.json')).status).toBe(400);
    expect((await file('.agents/remote-tokens.json', 'PUT')).status).toBe(400);
    expect((await file('verification.json', 'PUT')).status).toBe(400);
    expect(verifyRemoteToken(root, token)).toBeTruthy();
    // From another device, even by IP, the token routes answer nobody, token or not.
    const lan = { ...h, 'x-test-peer': '192.168.1.20', Host: `192.168.1.5:${port}` };
    const mint = await raw({
      method: 'POST',
      path: '/__teamtrail/remote-agents/tokens',
      headers: lan,
      body: { name: 'more' },
    });
    expect(mint.status).toBe(403);
    expect(mint.text).not.toContain('tt_');
    expect((await raw({ path: '/__teamtrail/remote-agents', headers: lan })).status).toBe(403);
    expect(remoteTokenViews(root).length).toBe(1);
  });

  it('on this port /mcp answers this machine only, even with a valid token; the Lookout itself still opens by IP', async () => {
    const lan = { 'x-test-peer': '192.168.1.20', Host: `192.168.1.5:${port}` };
    const refused = await raw({ method: 'POST', path: '/mcp', headers: { ...lan, ...bearer() }, body: initialize });
    expect(refused.status).toBe(403);
    expect(refused.text).toMatch(/this machine only.*teamtrail mcp --http/);
    expect(mcp.sessionCount()).toBe(0);
    expect((await raw({ path: '/', headers: lan })).text).toContain('lookout');
    expect((await raw({ path: '/__teamtrail/agents', headers: lan })).status).toBe(200);
  });

  it('without a paired browser the API answers nothing but sign-in; the page shell and /mcp are as before', async () => {
    const none = { Cookie: '' };
    for (const p of ['/__teamtrail/list', '/__teamtrail/events', '/__teamtrail/remote-agents', '/__teamtrail/projects'])
      expect((await raw({ path: p, headers: none })).status, p).toBe(401);
    // an agent's token is no session
    expect((await raw({ path: '/__teamtrail/list', headers: { ...none, ...bearer() } })).status).toBe(401);
    expect(JSON.parse((await raw({ path: '/__teamtrail/session', headers: none })).text).signedIn).toBe(false);
    expect((await raw({ path: '/', headers: none })).text).toContain('lookout');
    expect(
      (await raw({ method: 'POST', path: '/mcp', headers: { ...none, ...bearer() }, body: initialize })).status,
    ).toBe(200);
  });
});
