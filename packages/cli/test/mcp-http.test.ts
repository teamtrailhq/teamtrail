import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter } from '@teamtrail/core';
import {
  createRemoteToken,
  readAgentDocs,
  readAttempts,
  readLeases,
  remoteTokenViews,
  revokeRemoteToken,
  writeAgentAnswer,
} from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpHttp } from '../src/mcp/http/createMcpHttp';
import { remoteAgentOpener } from '../src/mcp/http/remoteAgentOpener';
import { tokenFileAuth } from '../src/mcp/http/tokenFileAuth';
import type { McpHttp, McpHttpOptions } from '../src/mcp/http/types';
import { humanRoles } from '../src/mcp/remoteGate';
import { createMcpServer } from '../src/mcp/server';
import { approveAllHere } from './fakes/trailLead';

let repo: string;
let root: string;
let server: http.Server;
let mcp: McpHttp;
let port: number;
const open: { close(): unknown }[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(what: string, ok: () => boolean | Promise<boolean>, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The endpoint as `teamtrail mcp --http` serves it: only `/mcp`, tokens from the repo's file. */
async function serve(opts: Partial<McpHttpOptions> = {}) {
  mcp = createMcpHttp({
    auth: tokenFileAuth(root),
    open: remoteAgentOpener({ root, version: '0.0.0-test', agent: { pollMs: 20 } }),
    sweepMs: 30,
    ...opts,
  });
  server = http.createServer((req, res) => {
    if (new URL(req.url ?? '/', 'http://x').pathname === '/mcp') return void mcp.handle(req, res);
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
}

const endpoint = () => `http://127.0.0.1:${port}/mcp`;
const newToken = (name: string) => createRemoteToken(root, name).token;

type Call = <T = Record<string, unknown>>(name: string, args?: Record<string, unknown>) => Promise<T>;

function caller(client: Client, timeout = 15_000): Call {
  return async <T>(name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args }, undefined, { timeout })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}

/** A real MCP client over streamable HTTP, like an agent on another machine. */
async function connectHttp(token: string, clientName = 'claude-code') {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint()), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: clientName, version: '1.0.0' });
  await client.connect(transport);
  open.push({ close: () => client.close().catch(() => {}) });
  return { call: caller(client), impatient: caller(client, 3000), client, transport };
}

/** An agent in its own "process" the way `teamtrail mcp` over stdio is one: same tools, no HTTP. */
async function connectLocal() {
  const agent = new TrailAgent({ root, pollMs: 20, client: () => 'claude-code 1.0.0' });
  const local = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([local.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return caller(client);
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'raw', version: '1' } },
};

/** A raw request, for the headers a well-behaved client never sends. */
function raw(o: { method?: string; headers?: Record<string, string>; body?: unknown; path?: string }) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: o.path ?? '/mcp',
        method: o.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...o.headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          text += c;
          // an SSE answer stays open for keep-alives: one message is all these tests need
          if (text.includes('\n\n')) res.destroy();
        });
        res.on('close', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
      },
    );
    req.on('error', reject);
    req.end(o.body === undefined ? undefined : JSON.stringify(o.body));
  });
}

const startTrail = (call: Call) =>
  call<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
    discovery: false,
    title: 'Offline sync',
    destination: 'Edits made offline survive',
    tickets: [
      { ref: 'a', title: 'Survey CRDT libraries', type: 'research' },
      { ref: 'b', title: 'Pick a storage format', type: 'research' },
      { ref: 'c', title: 'Sketch the sync protocol', type: 'research' },
    ],
  });

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-http-'));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  await mcp?.close();
  server?.closeAllConnections();
  await new Promise((r) => (server ? server.close(r) : r(undefined)));
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('MCP over HTTP: who gets in', () => {
  it('is closed until a token exists, and says the same thing to every wrong caller', async () => {
    await serve();
    const none = await raw({ body: initialize, headers: { Authorization: 'Bearer tt_anything' } });
    expect(none.status).toBe(401);
    expect(none.headers['www-authenticate']).toBe('Bearer');

    const token = newToken('sandbox');
    const missing = await raw({ body: initialize });
    const wrong = await raw({ body: initialize, headers: { Authorization: `Bearer ${token}x` } });
    const basic = await raw({ body: initialize, headers: { Authorization: `Basic ${token}` } });
    const inUrl = await raw({ body: initialize, path: `/mcp?token=${token}` });
    for (const r of [missing, wrong, basic, inUrl]) {
      expect(r.status).toBe(401);
      expect(r.text).toBe(none.text);
      expect(r.text).not.toContain(token);
    }
    expect(mcp.sessionCount()).toBe(0);

    const ok = await raw({ body: initialize, headers: { Authorization: `Bearer ${token}` } });
    expect(ok.status).toBe(200);
    expect(ok.headers['mcp-session-id']).toBeTruthy();
  });

  it('keeps only a hash of the token on disk', async () => {
    const token = newToken('sandbox');
    const files = fs.readdirSync(path.join(root, '.agents'));
    for (const f of files) expect(fs.readFileSync(path.join(root, '.agents', f), 'utf8')).not.toContain(token);
    expect(fs.readFileSync(path.join(root, '.agents', '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('refuses a rebinding page: a foreign Host or Origin never reaches the token check', async () => {
    await serve();
    const auth = { Authorization: `Bearer ${newToken('sandbox')}` };
    const host = await raw({ body: initialize, headers: { ...auth, Host: 'evil.example:7421' } });
    expect(host.status).toBe(403);
    const origin = await raw({ body: initialize, headers: { ...auth, Origin: 'http://evil.example' } });
    expect(origin.status).toBe(403);
    const rebinding = await raw({
      body: initialize,
      headers: { ...auth, Host: 'evil.example', Origin: 'http://evil.example' },
    });
    expect(rebinding.status).toBe(403);
    // A host a URL parser would read as "credentials@address" is not an address.
    const disguised = await raw({ body: initialize, headers: { ...auth, Host: 'evil.example@127.0.0.1' } });
    expect(disguised.status).toBe(403);
    expect(mcp.sessionCount()).toBe(0);
    // No CORS header either way: a page on another origin can't read an answer.
    expect(host.headers['access-control-allow-origin']).toBeUndefined();
    const local = await raw({ body: initialize, headers: { ...auth, Host: `localhost:${port}` } });
    expect(local.status).toBe(200);
    expect(local.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers to a named host only when told to (--allow-host)', async () => {
    await serve({ allowedHosts: ['trail.example.com'] });
    const auth = { Authorization: `Bearer ${newToken('sandbox')}` };
    expect((await raw({ body: initialize, headers: { ...auth, Host: 'trail.example.com' } })).status).toBe(200);
    expect((await raw({ body: initialize, headers: { ...auth, Host: 'other.example.com' } })).status).toBe(403);
  });

  it('a session answers only to the token that opened it', async () => {
    await serve();
    const a = await connectHttp(newToken('agent a'));
    const other = newToken('agent b');
    const session = a.transport.sessionId!;
    const tools = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
    const stolen = await raw({ body: tools, headers: { Authorization: `Bearer ${other}`, 'Mcp-Session-Id': session } });
    expect(stolen.status).toBe(404);
    const unknown = await raw({ body: tools, headers: { Authorization: `Bearer ${other}`, 'Mcp-Session-Id': 'nope' } });
    expect(unknown.text).toBe(stolen.text);
  });

  it('serves nothing but the MCP path, and no tool reaches other repos', async () => {
    await serve();
    const token = newToken('sandbox');
    const elsewhere = await raw({
      path: '/__teamtrail/list',
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(elsewhere.status).toBe(404);
    const { call } = await connectHttp(token);
    await expect(call('projects_status')).rejects.toThrow(/remote connection is for this repo only/);
  });
});

describe('MCP over HTTP: the same engine', () => {
  it('runs a trail end to end over HTTP', async () => {
    await serve();
    const { call, client } = await connectHttp(newToken('sandbox'));
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('claim_ticket');
    // A trail without discovery is the human's call, so a local agent (at their terminal) starts this one.
    const m = await startTrail(await connectLocal());
    const claimed = await call<{ claimed: { key: string; assignee: string }; git: { note: string } }>('claim_ticket');
    expect(claimed.claimed).toMatchObject({ key: m.tickets[0].key, assignee: 'claude-02' });
    expect(claimed.git.note).toMatch(/can't see your checkout/);
    await call('report_progress', { step: 'Investigate', message: 'Yjs fits' });
    const closed = await call<{ closed: string; next: { key: string } }>('close_ticket', { resolution: 'Use Yjs' });
    expect(closed).toMatchObject({ closed: m.tickets[0].key, next: { key: m.tickets[1].key } });
    const docs = await readAgentDocs(root);
    expect(docs.some((d) => d.feed.some((f) => f.text.includes('connected over HTTP · token "sandbox"')))).toBe(true);
    expect(remoteTokenViews(root)[0].lastUsedAt).toBeGreaterThan(0);
  });

  it('two HTTP agents and a local one share leases and the inbox', async () => {
    await serve();
    const one = await connectHttp(newToken('sandbox one'));
    const two = await connectHttp(newToken('sandbox two'), 'codex');
    const local = await connectLocal();
    const m = await startTrail(local);

    const claims = [];
    for (const c of [one.call, two.call, local])
      claims.push(await c<{ claimed: { key: string; assignee: string } }>('claim_ticket'));
    const byAgent = Object.fromEntries(claims.map((c) => [c.claimed.assignee, c.claimed.key]));
    expect(Object.keys(byAgent).sort()).toEqual(['claude-01', 'claude-02', 'codex-01'].sort());
    expect(Object.values(byAgent).sort()).toEqual(m.tickets.map((t) => t.key).sort());
    expect(
      readLeases(root)
        .map((l) => l.agent)
        .sort(),
    ).toEqual(Object.keys(byAgent).sort());
    // Session docs are files named by session id: three agents in two processes must not collide.
    const sessions = (await readAgentDocs(root)).map((d) => d.session.id);
    expect(new Set(sessions).size).toBe(sessions.length);
    await expect(two.call('claim_ticket', { ticket: byAgent['claude-01'] })).rejects.toThrow(/claimed|assigned|taken/i);

    const asked = await Promise.all([
      one.call<{ questionId: string }>('ask_human', { question: 'From HTTP one?', waitSeconds: 0 }),
      two.call<{ questionId: string }>('ask_human', { question: 'From HTTP two?', waitSeconds: 0 }),
      local<{ questionId: string }>('ask_human', { question: 'From the local agent?', waitSeconds: 0 }),
    ]);
    for (const c of [one.call, two.call, local]) {
      const inbox = await c<{ questions: { questionId: string; question: string }[] }>('list_inbox');
      expect(inbox.questions.map((q) => q.questionId).sort()).toEqual(asked.map((a) => a.questionId).sort());
    }
  });

  it('never takes this checkout for a remote agent’s work: no worktree, no checks, the human decides', async () => {
    await serve();
    const marker = path.join(repo, 'check-ran.txt');
    fs.writeFileSync(
      path.join(root, 'verification.json'),
      JSON.stringify({
        v: 1,
        checks: {
          check: { run: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, '')`] },
        },
        run: ['check'],
      }),
    );
    fs.writeFileSync(path.join(root, 'workspaces.json'), JSON.stringify({ v: 1, worktrees: true }));
    approveAllHere(root);
    const { call } = await connectHttp(newToken('sandbox'));
    const local = await connectLocal();
    const m = await local<{ trail: { id: string }; tickets: { key: string; id?: string }[] }>('start_trail', {
      discovery: false,
      title: 'Changelog',
      destination: 'A changelog page',
      tickets: [{ ref: 'build', title: 'Build the page', type: 'execute' }],
    });
    const claimed = await call<{ workspace?: unknown; workspaceNote?: string }>('claim_ticket', {
      ticket: m.tickets[0].key,
      touches: ['src/changelog/**'],
    });
    expect(claimed.workspace).toBeUndefined();
    expect(claimed.workspaceNote).toMatch(/connected remotely/);
    expect(readLeases(root)[0].touches).toEqual(['src/changelog/**']);

    // Nothing here sees its checkout, so it names the files it changed: shown to the human as its word.
    await expect(call('close_ticket', { resolution: 'Built it on branch feat/changelog' })).rejects.toThrow(
      /pass paths with the files you changed/,
    );
    const done = await call<{ status: string; closed?: string; note: string; checks: unknown[] }>('close_ticket', {
      resolution: 'Built it on branch feat/changelog',
      paths: ['src/changelog/page.ts'],
    });
    expect(done).toMatchObject({ status: 'blocked', checks: [] });
    expect(done.closed).toBeUndefined();
    expect(done.note).toMatch(/connected remotely, so no check ran/);
    expect(fs.existsSync(marker)).toBe(false);
    const attempt = readAttempts(root, m.trail.id, m.tickets[0].key.replace('#', ''))[0];
    expect(attempt).toMatchObject({ result: 'error', remote: true, checks: [] });
    expect(attempt.git).toBeUndefined();
    expect(attempt.note).toMatch(/Completed by a remote agent/);
    expect(attempt.note).toMatch(/Files it says it changed \(not verified\): src\/changelog\/page\.ts/);
    expect(attempt.declaredPaths).toEqual(['src/changelog/page.ts']);
  });
});

describe('MCP over HTTP: check commands waiting for approval', () => {
  it('a remote completion is never stuck: no command runs and the ticket goes to the human', async () => {
    await serve();
    const marker = path.join(repo, 'check-ran.txt');
    const config = (code: string) =>
      JSON.stringify({ v: 1, checks: { check: { run: [process.execPath, '-e', code] } }, run: ['check'] });
    fs.writeFileSync(path.join(root, 'verification.json'), config('0'));
    approveAllHere(root);
    const { call } = await connectHttp(newToken('sandbox'));
    const local = await connectLocal();
    const m = await local<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
      discovery: false,
      title: 'Changelog',
      destination: 'A changelog page',
      tickets: [{ ref: 'build', title: 'Build the page', type: 'execute' }],
    });
    await call('claim_ticket', { ticket: m.tickets[0].key });
    // edited after the approval: its commands wait for the trail lead again
    fs.writeFileSync(
      path.join(root, 'verification.json'),
      config(`require('fs').writeFileSync(${JSON.stringify(marker)}, '')`),
    );
    const done = await call<{ status: string; note: string }>('close_ticket', {
      resolution: 'Built it on feat/changelog',
      paths: ['src/changelog/page.ts'],
    });
    expect(done.status).toBe('blocked');
    expect(fs.existsSync(marker)).toBe(false);
    const status = await call<{ phase: string; attempts: unknown[] }>('verification_status', {
      ticket: m.tickets[0].key,
    });
    expect(status.phase).toBe('blocked');
    expect(status.attempts).toHaveLength(1);
  });
});

describe('MCP over HTTP: long waits and endings', () => {
  /** Opens ask_human over a raw socket with an idle timeout, as a proxy or a client body timeout would apply. */
  async function waitOnSilentSocket(token: string, idleMs: number) {
    const init = await raw({ body: initialize, headers: { Authorization: `Bearer ${token}` } });
    const headers = {
      Authorization: `Bearer ${token}`,
      'Mcp-Session-Id': String(init.headers['mcp-session-id']),
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    await raw({ body: { jsonrpc: '2.0', method: 'notifications/initialized' }, headers });
    const body = {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'ask_human', arguments: { question: 'Ship it?', framing: true, waitSeconds: 30 } },
    };
    return new Promise<{ timedOut: boolean; text: string }>((resolve) => {
      let text = '';
      const req = http.request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers }, (res) => {
        res.setEncoding('utf8');
        res.on('data', (c) => {
          text += c;
          if (text.includes('"id":7')) resolve({ timedOut: false, text });
        });
      });
      req.setTimeout(idleMs, () => {
        resolve({ timedOut: true, text });
        req.destroy();
      });
      req.on('error', () => {});
      req.end(JSON.stringify(body));
    });
  }

  const answerWhenAsked = async (after: number) => {
    await until('the question', async () => (await readAgentDocs(root)).some((d) => d.pending.length > 0));
    await sleep(after);
    const doc = (await readAgentDocs(root)).find((d) => d.pending.length)!;
    writeAgentAnswer(root, {
      sessionId: doc.session.id,
      questionId: doc.pending[0].id,
      text: 'Yes',
      author: 'trail lead',
    });
  };

  it('keeps a long ask_human alive on a connection that drops after a second of silence', async () => {
    await serve({ keepAliveMs: 100 });
    const waiting = waitOnSilentSocket(newToken('sandbox'), 1000);
    await answerWhenAsked(2500);
    const r = await waiting;
    expect(r.timedOut).toBe(false);
    expect(r.text).toContain(': keepalive');
    expect(r.text).toContain('\\"answered\\": true');
  });

  it('…which is the keep-alive’s doing: without it the same wait is cut off', async () => {
    await serve({ keepAliveMs: 0 });
    expect((await waitOnSilentSocket(newToken('sandbox'), 1000)).timedOut).toBe(true);
  });

  it('wait_for_answer over the SDK client gets an answer given later in the Lookout', async () => {
    await serve({ keepAliveMs: 100 });
    const { call } = await connectHttp(newToken('sandbox'));
    const asked = await call<{ answered: boolean; questionId: string }>('ask_human', {
      question: 'Which database?',
      framing: true,
      waitSeconds: 0,
    });
    expect(asked.answered).toBe(false);
    const waiting = call<{ answered: boolean; answer: string; answeredBy: string }>('wait_for_answer', {
      questionId: asked.questionId,
      waitSeconds: 30,
    });
    await answerWhenAsked(1200);
    expect(await waiting).toMatchObject({ answered: true, answer: 'Yes', answeredBy: 'trail lead' });
  });

  it('revoking a token ends its sessions, mid-wait, and refuses it from then on', async () => {
    await serve({ keepAliveMs: 100 });
    const keep = await connectHttp(newToken('stays'));
    const token = newToken('goes');
    const gone = await connectHttp(token);
    await startTrail(await connectLocal());
    await gone.call('claim_ticket');
    const waiting = gone.impatient('ask_human', { question: 'Still there?', waitSeconds: 30 }).then(
      () => 'answered',
      () => 'cut off',
    );
    await until('the question', async () => (await readAgentDocs(root)).some((d) => d.pending.length > 0));
    expect(mcp.sessionCount()).toBe(2);

    const id = remoteTokenViews(root).find((t) => t.name === 'goes')!.id;
    revokeRemoteToken(root, id);
    await until('the session to end', () => mcp.sessionCount() === 1);
    expect(await waiting).toBe('cut off');
    const docs = await readAgentDocs(root);
    const ended = docs.filter((d) => d.feed.some((f) => f.text.includes('token "goes"')));
    expect(ended.length).toBe(1);
    expect(ended.map((d) => d.session.status)).not.toContain('running');
    expect(ended.some((d) => d.feed.some((f) => f.text.includes('Token revoked')))).toBe(true);
    expect(docs.flatMap((d) => d.pending)).toEqual([]);

    const again = await raw({ body: initialize, headers: { Authorization: `Bearer ${token}` } });
    expect(again.status).toBe(401);
    await expect(connectHttp(token)).rejects.toThrow();
    expect(await keep.call<{ questions: unknown[] }>('list_inbox')).toMatchObject({ questions: [] });
  });

  it('ends a session when the client says goodbye', async () => {
    await serve();
    const a = await connectHttp(newToken('sandbox'));
    expect(mcp.sessionCount()).toBe(1);
    await a.transport.terminateSession();
    await until('the goodbye', () => mcp.sessionCount() === 0);
  });

  it('an open notification stream keeps nothing alive: a client that only listens is closed too', async () => {
    await serve({ idleMs: 300 });
    const a = await connectHttp(newToken('sandbox'));
    await a.call('status').catch(() => undefined);
    expect(mcp.sessionCount()).toBe(1);
    await until('the listening session to be closed', () => mcp.sessionCount() === 0);
  });

  it('one token holds a few sessions at most: a new one displaces its own longest-idle one, never another token\u2019s', async () => {
    await serve({ maxSessionsPerToken: 2, keepAliveMs: 100 });
    const greedy = newToken('greedy');
    const other = await connectHttp(newToken('other'));
    const init = () => raw({ body: initialize, headers: { Authorization: `Bearer ${greedy}` } });
    const first = await init();
    const second = await init();
    expect(mcp.sessionCount()).toBe(3);
    for (let i = 0; i < 10; i++) expect((await init()).status).toBe(200);
    expect(mcp.sessionCount()).toBe(3);
    const tools = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
    const old = (id: unknown) =>
      raw({ body: tools, headers: { Authorization: `Bearer ${greedy}`, 'Mcp-Session-Id': String(id) } });
    expect((await old(first.headers['mcp-session-id'])).status).toBe(404);
    expect((await old(second.headers['mcp-session-id'])).status).toBe(404);
    expect((await other.client.listTools()).tools.length).toBeGreaterThan(0);

    // Both of its sessions at work (waiting on the human): nothing idle to displace, so the next one is refused.
    const busy = await Promise.all([connectHttp(greedy), connectHttp(greedy)]);
    const waits = busy.map((b, i) =>
      b.impatient('ask_human', { question: `Busy ${i}?`, framing: true, waitSeconds: 20 }).catch(() => undefined),
    );
    await until('both questions', async () => (await readAgentDocs(root)).flatMap((d) => d.pending).length === 2);
    const refused = await init();
    expect(refused.status).toBe(503);
    expect(refused.text).toMatch(/already has 2 sessions at work/);
    expect((await other.client.listTools()).tools.length).toBeGreaterThan(0);
    await Promise.all(waits);
  });

  it('ends a session that went quiet without one: a sandbox that was switched off', async () => {
    await serve({ idleMs: 200 });
    const quiet = await raw({ body: initialize, headers: { Authorization: `Bearer ${newToken('sandbox')}` } });
    expect(quiet.status).toBe(200);
    expect(mcp.sessionCount()).toBe(1);
    await until('the quiet one to be closed', () => mcp.sessionCount() === 0);
  });
});

describe('MCP over HTTP: never the human\u2019s voice', () => {
  type Result = { isError?: boolean; content: { text: string }[] };
  const names = async (client: Client) => (await client.listTools()).tools.map((t) => t.name);

  /** What every tool declared, read from a local server: the declarations are the same for both kinds. */
  function declared() {
    const agent = new TrailAgent({ root, pollMs: 20, client: () => 'claude-code 1.0.0' });
    open.push({ close: () => agent.close() });
    return [...humanRoles(createMcpServer(agent, '0.0.0-test'))];
  }

  it('every tool says whether it speaks for the human, and the ones that do are exactly these', () => {
    const roles = declared();
    expect(roles.length).toBe(30);
    const acts = roles.filter(([, r]) => r !== 'none' && r.kind === 'acts').map(([n]) => n);
    const inputs = roles.flatMap(([n, r]) => (r !== 'none' && r.kind === 'inputs' ? [[n, Object.keys(r.inputs)]] : []));
    // Changing either list is a security decision: a tool that acts for the human must never reach remote agents.
    expect(acts).toEqual(['answer_question']);
    expect(Object.fromEntries(inputs)).toEqual({
      start_trail: ['discovery'],
      update_trail: ['mode', 'destination'],
    });
  });

  it('a remote session is not offered a tool that acts for the human, and is refused if it calls one', async () => {
    await serve();
    const remote = await connectHttp(newToken('sandbox'));
    const listed = await names(remote.client);
    const acting = declared().filter(([, r]) => r !== 'none' && r.kind === 'acts');
    expect(acting.length).toBeGreaterThan(0);
    for (const [name] of acting) {
      expect(listed).not.toContain(name);
      const r = (await remote.client.callTool({ name, arguments: { questionId: 'q', answer: 'yes' } })) as Result;
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/not available over a remote connection/);
    }
    expect(listed.length).toBe(declared().length - acting.length);
    const refused = (await remote.client.callTool({
      name: 'answer_question',
      arguments: { questionId: 'q', answer: 'yes' },
    })) as Result;
    expect(refused.content[0].text).toMatch(/Answering is the trail lead's: they answer in the Lookout or Slack/);
  });

  it('a local agent keeps every tool, answer_question included', async () => {
    const agent = new TrailAgent({ root, pollMs: 20, client: () => 'claude-code 1.0.0' });
    const local = createMcpServer(agent, '0.0.0-test');
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'claude-code', version: '1.0.0' });
    await Promise.all([local.connect(a), client.connect(b)]);
    open.push({ close: () => agent.close() }, client);
    expect((await names(client)).sort()).toEqual(
      declared()
        .map(([n]) => n)
        .sort(),
    );
    const call = caller(client);
    const asked = await call<{ questionId: string }>('ask_human', { question: 'Go?', framing: true, waitSeconds: 0 });
    expect(await call('answer_question', { questionId: asked.questionId, answer: 'Go' })).toMatchObject({
      delivered: true,
    });
    await call('start_trail', { discovery: false, title: 'Local', destination: 'Works as before' });
    await call('update_trail', { mode: 'plan-only', destination: 'Still the local agent\u2019s to edit' });
    // The local agent passed on the human's answer with answer_question: the decision is theirs by that question.
    const d = await call<{ decision: { decidedBy: string; answer: string } }>('record_decision', {
      question: 'Which?',
      answer: 'This',
      questionId: asked.questionId,
    });
    expect(d.decision).toMatchObject({ decidedBy: 'trail lead', answer: 'Go' });
  });

  it('a remote agent cannot answer its own question, nor anyone else\u2019s', async () => {
    await serve();
    const remote = await connectHttp(newToken('sandbox'));
    const local = await connectLocal();
    const mine = await remote.call<{ questionId: string }>('ask_human', {
      question: 'Mine?',
      framing: true,
      waitSeconds: 0,
    });
    const theirs = await local<{ questionId: string }>('ask_human', {
      question: 'Theirs?',
      framing: true,
      waitSeconds: 0,
    });
    for (const questionId of [mine.questionId, theirs.questionId])
      await expect(remote.call('answer_question', { questionId, answer: 'yes' })).rejects.toThrow(
        /not available over a remote connection/,
      );
    const inbox = await remote.call<{ questions: { questionId: string }[] }>('list_inbox');
    expect(inbox.questions.map((q) => q.questionId).sort()).toEqual([mine.questionId, theirs.questionId].sort());
  });

  it('a remote agent cannot pass an input that claims the human decided', async () => {
    await serve();
    const { call } = await connectHttp(newToken('sandbox'));
    const start = { title: 'Remote trail', destination: 'Charted from a sandbox' };
    await expect(call('start_trail', { ...start, discovery: false })).rejects.toThrow(/`discovery` is not available/);
    const made = await call<{ tickets: { title: string }[] }>('start_trail', { ...start, discovery: true });
    expect(made.tickets.length).toBe(1);
    await expect(call('update_trail', { mode: 'plan-only' })).rejects.toThrow(/`mode` is not available/);
    await expect(call('update_trail', { destination: 'Somewhere else' })).rejects.toThrow(/propose_reroute/);
    await call('update_trail', { notes: 'Notes are the agent\u2019s to write' });
    const decision = { question: 'Which?', answer: 'This' };
    // Naming the human in an argument is not the human deciding, high risk or not.
    for (const decidedBy of ['operator', 'trail lead', 'slack:U123'])
      for (const extra of [{}, { category: 'data-deletion' }])
        await expect(call('record_decision', { ...decision, ...extra, decidedBy })).rejects.toThrow(/pass questionId/);
    const own = await call<{ decision: { decidedBy: string } }>('record_decision', decision);
    expect(own.decision.decidedBy).toBe('claude-01');
    // A high-risk call is the human's: recording it is refused, and the way out is asking, not "operator".
    const risky = call('record_decision', { ...decision, category: 'data-deletion' });
    await expect(risky).rejects.toThrow(/High-risk call.*record_decision with that questionId/);
  });

  it('a remote agent closes a HITL ticket only after the human answered in the Lookout', async () => {
    await serve();
    const local = await connectLocal();
    const m = await local<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
      discovery: false,
      title: 'Pick a format',
      destination: 'A format is chosen',
      tickets: [
        { ref: 'j', title: 'Which format?', type: 'junction' },
        { ref: 'k', title: 'Keep the legacy exports?', type: 'junction' },
      ],
    });
    const { call } = await connectHttp(newToken('sandbox'));
    await call('claim_ticket', { ticket: m.tickets[0].key });
    await expect(call('close_ticket', { resolution: 'JSON, I decided' })).rejects.toThrow(/the human's to decide/);
    // Ruling it out without the human's answer only proposes it to them.
    const ruled = await call<{ outcome: string; closed: null }>('close_ticket', {
      resolution: 'Not needed',
      outcome: 'out_of_scope',
    });
    expect(ruled).toMatchObject({ outcome: 'proposed', closed: null });
    const ask = async (question: string, answer: string, extra: Record<string, unknown> = {}) => {
      const waiting = call<{ answered: boolean; questionId: string }>('ask_human', {
        question,
        waitSeconds: 30,
        ...extra,
      });
      await until('the question', async () => (await readAgentDocs(root)).some((d) => d.pending.length > 0));
      const doc = (await readAgentDocs(root)).find((d) => d.pending.length)!;
      writeAgentAnswer(root, {
        sessionId: doc.session.id,
        questionId: doc.pending[0].id,
        text: answer,
        author: 'trail lead',
      });
      const r = await waiting;
      expect(r.answered).toBe(true);
      await until(
        'the answer to be gone from the inbox',
        async () => !(await readAgentDocs(root)).some((d) => d.pending.length),
      );
      return r.questionId;
    };
    // The reviewer's attack: the human says "tabs" to a harmless question, and that answer is then spent on
    // dropping a table. An answer carries only the category it was asked with, so none of these go through.
    const harmless = await ask('Tabs or spaces?', 'tabs');
    const drop = { resolution: 'Drop the users table', category: 'data-deletion' };
    await expect(call('close_ticket', drop)).rejects.toThrow(/the human's to decide/);
    await expect(call('close_ticket', { ...drop, questionId: harmless })).rejects.toThrow(
      /asked without a category, and this decision is "data-deletion"/,
    );
    const decision = { question: 'Drop it?', answer: 'Drop the users table' };
    await expect(
      call('record_decision', { ...decision, category: 'data-deletion', questionId: harmless }),
    ).rejects.toThrow(/asked without a category/);

    // Used for what it answered, it closes the ticket: the record holds the question as asked and their word.
    type Closed = { closed: string; decision: { id: string; decidedBy: string } };
    const done = await call<Closed>('close_ticket', { resolution: 'Indent with tabs everywhere' });
    expect(done).toMatchObject({ closed: m.tickets[0].key, decision: { decidedBy: 'trail lead' } });
    const record = (
      await new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root).listDecisions(m.trail.id)
    ).find((d) => d.id === done.decision.id)!;
    expect(record).toMatchObject({
      question: 'Tabs or spaces?',
      answer: 'tabs',
      rationale: "claude-02's reading: Indent with tabs everywhere",
    });
    // And it is used up: three more "human" decisions on the back of it are three refusals.
    for (let i = 0; i < 3; i++)
      await expect(call('record_decision', { ...decision, questionId: harmless })).rejects.toThrow(
        /already backs the close of #\d+: one answer, one decision/,
      );

    // An fyi asked while holding the next ticket is not a decision about it.
    await call('claim_ticket', { ticket: m.tickets[1].key });
    const lunch = await ask('Lunch?', 'yes', { urgency: 'fyi' });
    await expect(call('close_ticket', { resolution: 'Drop the users table' })).rejects.toThrow(/the human's to decide/);
    await expect(call('close_ticket', { resolution: 'Drop the users table', questionId: lunch })).rejects.toThrow(
      /asked as an fyi/,
    );
    // Nor does a risk that comes from the files slip past an answer asked without a category.
    await expect(
      call('record_decision', { ...decision, paths: ['db/migrations/001_drop_users.sql'], questionId: lunch }),
    ).rejects.toThrow(/asked without a category/);

    // A second HITL ticket: an answer given on the first can't close it, and neither can a question asked elsewhere.
    await call('claim_ticket', { ticket: m.tickets[1].key });
    await expect(call('close_ticket', { resolution: 'Same as before' })).rejects.toThrow(/the human's to decide/);
    await expect(call('close_ticket', { resolution: 'Same as before', questionId: harmless })).rejects.toThrow(
      /already backs|was not asked on/,
    );
    const right = await ask('Delete the legacy exports?', 'Yes, delete them', { category: 'data-deletion' });
    const risky = await call<Closed>('close_ticket', {
      resolution: 'Deleted',
      category: 'data-deletion',
      questionId: right,
    });
    expect(risky.decision.decidedBy).toBe('trail lead');
  });
});
