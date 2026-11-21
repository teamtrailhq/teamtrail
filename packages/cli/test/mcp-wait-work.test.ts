import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRemoteToken, writeTicketCriteria } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMcpHttp } from '../src/mcp/http/createMcpHttp';
import { remoteAgentOpener } from '../src/mcp/http/remoteAgentOpener';
import { tokenFileAuth } from '../src/mcp/http/tokenFileAuth';
import type { McpHttp } from '../src/mcp/http/types';
import { agents, type Call } from './fakes/agents';
import { approveAllHere, confirmCriteriaHereNow } from './fakes/trailLead';

let repo: string;
let root: string;
const hub = agents(() => root);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Resolves once `ok` holds, read again every few milliseconds. */
async function until(ok: () => boolean) {
  while (!ok()) await sleep(10);
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-wait-'));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      default: 'checks',
      checks: { check: { run: [process.execPath, '-e', '0'] } },
      run: ['check'],
    }),
  );
  approveAllHere(root);
});
afterEach(async () => {
  await hub.closeAll();
  fs.rmSync(repo, { recursive: true, force: true });
});

type Started = { trail: { id: string }; tickets: { ref: string; key: string }[] };
type Next = {
  ticket: { key: string } | null;
  reason?: string;
  waited?: { seconds: number; woke: string; because?: string; next?: string };
};

/** One implementation ticket whose criteria the charting agent wrote: it waits for the human to confirm them. */
async function chartHeld(call: Call) {
  const m = await call<Started>('start_trail', {
    discovery: false,
    title: 'Exports',
    destination: 'Clients export their data',
    tickets: [
      { ref: 'x', title: 'Build the export', type: 'execute', criteria: [{ text: 'Exports rows', kind: 'unit' }] },
    ],
  });
  const key = m.tickets[0].key;
  return { mapId: m.trail.id, key, id: key.slice(1) };
}

/** The trail lead confirms the ticket's criteria in the Lookout. */
function confirm(t: { mapId: string; key: string; id: string }) {
  writeTicketCriteria(root, { id: t.mapId, title: 'Exports' }, { id: t.id, key: t.key }, { confirmed: true });
  confirmCriteriaHereNow(root, t.mapId, t.id);
}

/**
 * Starts a wait and resolves once the call says it waits: its first progress comes after it looked and found nothing,
 * with the change it waits for already being listened to.
 */
function startWaiting(call: Call, args: Record<string, unknown>) {
  let began!: () => void;
  const waiting = new Promise<void>((r) => (began = r));
  const result = call<Next>('next_ticket', { wait: true, ...args }, { onprogress: () => began() });
  return { result, waiting: Promise.race([waiting, result.then(() => undefined)]) };
}

/** Starts a wait, confirms the criteria once the agent waits, and says how long the agent took to hear of it. */
async function pickupAfterConfirm(call: Call, t: { mapId: string; key: string; id: string }) {
  const w = startWaiting(call, { waitSeconds: 20 });
  await w.waiting;
  const confirmedAt = Date.now();
  confirm(t);
  const r = await w.result;
  return { r, latency: Date.now() - confirmedAt };
}

describe('next_ticket wait: an agent picks up newly ready work at once', () => {
  it('returns the ticket within a second of the human confirming its criteria', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const t = await chartHeld(call);
    expect(await call<Next>('next_ticket')).toMatchObject({ ticket: null, reason: expect.stringMatching(/confirm/) });

    const { r, latency } = await pickupAfterConfirm(call, t);
    expect(r.ticket?.key).toBe(t.key);
    expect(r.waited).toMatchObject({ woke: 'work', because: expect.any(String) });
    expect(latency).toBeLessThan(1000);
    // waiting held nothing: the ticket is still unclaimed, and the agent claims it now
    await call('claim_ticket', { ticket: t.key });
  });

  it('returns at once when work is already claimable, and without wait it never waits', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const t = await chartHeld(call);
    const started = Date.now();
    expect((await call<Next>('next_ticket', { wait: false })).ticket).toBeNull();
    confirm(t);
    const r = await call<Next>('next_ticket', { wait: true, waitSeconds: 30 });
    expect(r).toMatchObject({ ticket: { key: t.key }, waited: { seconds: 0, woke: 'ready' } });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('times out with what next_ticket says now, and tells the agent to call again', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    await chartHeld(call);
    const started = Date.now();
    const r = await call<Next>('next_ticket', { wait: true, waitSeconds: 1 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(r).toMatchObject({ ticket: null, reason: expect.stringMatching(/confirm/), waited: { woke: 'timeout' } });
    expect(r.waited?.next).toMatch(/wait=true again/);
  });

  it('a change that frees nothing keeps it waiting', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    await chartHeld(call);
    const w = startWaiting(call, { waitSeconds: 2 });
    await w.waiting;
    fs.writeFileSync(path.join(root, 'attention.json'), JSON.stringify({ v: 1 }));
    expect((await w.result).waited?.woke).toBe('timeout');
  });

  it('does not wait on a trail with nothing open', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    await call('start_trail', {
      discovery: false,
      title: 'Tiny',
      destination: 'D',
      tickets: [{ ref: 'r', title: 'Look around', type: 'research' }],
    });
    await call('claim_ticket');
    await call('close_ticket', { resolution: 'Looked', outcome: 'completed' });
    const r = await call<Next>('next_ticket', { wait: true, waitSeconds: 30 });
    expect(r.waited).toMatchObject({ seconds: 0, woke: 'nothing-open' });
  });

  it('a remote agent waits the same way', async () => {
    const lead = await hub.connect({ name: 'claude-01' });
    const t = await chartHeld(lead);
    const remote = await hub.connect({ token: 'sandbox' });
    const { r, latency } = await pickupAfterConfirm(remote, t);
    expect(r.ticket?.key).toBe(t.key);
    expect(latency).toBeLessThan(1000);
  });
});

describe('next_ticket wait over HTTP', () => {
  let server: http.Server;
  let mcp: McpHttp;
  afterEach(async () => {
    vi.restoreAllMocks();
    await mcp?.close();
    server?.closeAllConnections();
    await new Promise((r) => (server ? server.close(r) : r(undefined)));
  });

  /** An HTTP agent of the `sandbox` token, connected. */
  async function httpClient(port: number, token: string) {
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    const client = new Client({ name: 'claude-code', version: '1.0.0' });
    await client.connect(transport);
    return client;
  }

  it('a waiting call keeps its session: it is not closed as idle, and returns the work', async () => {
    const idleMs = 60_000;
    mcp = createMcpHttp({
      auth: tokenFileAuth(root),
      open: remoteAgentOpener({ root, version: '0.0.0-test', agent: { pollMs: 20 } }),
      sweepMs: 30,
      idleMs,
    });
    server = http.createServer((req, res) => void mcp.handle(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const t = await chartHeld(await hub.connect({ name: 'claude-01' }));
    const token = createRemoteToken(root, 'sandbox').token;
    const client = await httpClient(port, token);
    // a second session of the same token that makes no call: the one the sweep closes as idle
    const idle = await httpClient(port, token);
    let began!: () => void;
    const waitBegan = new Promise<void>((r) => (began = r));
    const args = { wait: true, waitSeconds: 600 };
    const waiting = client.callTool({ name: 'next_ticket', arguments: args }, undefined, { onprogress: () => began() });
    await waitBegan;
    // two idle windows pass while it waits: the clock moves on, and the sweep closes the idle session only
    const now = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => now() + 2 * idleMs);
    await until(() => mcp.sessionCount() === 1);
    vi.restoreAllMocks();
    confirm(t);
    const r = (await waiting) as { content: { text: string }[] };
    expect(JSON.parse(r.content[0].text)).toMatchObject({ ticket: { key: t.key }, waited: { woke: 'work' } });
    await client.close().catch(() => {});
    await idle.close().catch(() => {});
  });
});
