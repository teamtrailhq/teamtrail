import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTrackerBridge, type TrackerBridge } from '@teamtrail/core/bridge';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';

let root: string;
let bridge: TrackerBridge;
let server: http.Server;
let base: string;
const open: { close(): void | Promise<void> }[] = [];

async function connect(agentName = 'claude-01') {
  const agent = new TrailAgent({ root, agent: agentName, pollMs: 20 });
  const mcp = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([mcp.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return async <T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}

const post = async (p: string, body: unknown) => {
  const r = await fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};
const get = async (p: string) => (await (await fetch(base + p)).json()) as Record<string, unknown>;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-reroute-'));
  bridge = createTrackerBridge(root, { env: {}, configDir: path.join(root, '..', 'cfg-' + path.basename(root)) });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  bridge.close();
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

type Started = { trail: { id: string; key: string }; tickets: { ref?: string; key: string; title: string }[] };

describe('adaptive trails over MCP', () => {
  it('challenge, propose, freeze, approve in the Lookout, then work the new plan', async () => {
    const call = await connect();
    const started = await call<Started>('start_trail', {
      discovery: false,
      title: 'Batch sync',
      destination: 'Edits sync in batches',
      tickets: [
        { ref: 'look', title: 'Check the v2 API', type: 'research' },
        { ref: 'batch', title: 'Batch writes', type: 'execute', blockedBy: ['look'] },
        { ref: 'docs', title: 'Write the docs', type: 'task' },
      ],
      assumptions: [{ text: 'The v2 API supports batch writes', tickets: ['batch'] }],
    });
    const mapId = started.trail.id;
    const key = (ref: string) => started.tickets.find((t) => t.ref === ref)!.key;
    const listed = await call<{ assumptions: { id: string; tickets: string[] }[] }>('list_assumptions');
    expect(listed.assumptions).toMatchObject([{ id: 'S-1', tickets: [key('batch')] }]);

    await call('claim_ticket', { ticket: key('look') });
    await call('close_ticket', { resolution: 'No batch endpoint in v2.', assumes: ['S-1'] });
    await expect(call('record_decision', { question: 'q', answer: 'a', assumes: ['S-9'] })).rejects.toThrow(
      /unknown assumption S-9/,
    );
    const ch = await call<{ assumption: { status: string }; dependents: { tickets: string[]; decisions: string[] } }>(
      'challenge_assumption',
      { assumption: 'S-1', evidence: 'docs/v2.md lists POST /items only' },
    );
    expect(ch).toMatchObject({
      assumption: { status: 'challenged' },
      dependents: { tickets: [key('batch')], decisions: ['D-1'] },
    });

    const invalid = await call<{ status: string; errors: { change: number }[] }>('propose_reroute', {
      reason: 'No batch API',
      evidence: 'docs/v2.md',
      changes: [{ op: 'cancel_ticket', ticket: '#99', reason: 'x' }],
    });
    expect(invalid).toMatchObject({ status: 'invalid', errors: [{ change: 0 }] });

    const before = fs.readFileSync(
      path.join(root, (await call<{ trail: { id: string } }>('status')).trail.id, 'map.md'),
      'utf8',
    );
    const proposed = await call<{ id: string; status: string; frozen: string[] }>('propose_reroute', {
      reason: 'v2 has no batch endpoint; queue single writes instead',
      evidence: 'docs/v2.md lists POST /items only',
      invalidates: ['S-1'],
      changes: [
        { op: 'cancel_ticket', ticket: key('batch'), reason: 'No batch API' },
        { op: 'add_ticket', ref: 'queue', title: 'Queue single writes', type: 'execute' },
        { op: 'add_ticket', ref: 'flush', title: 'Flush the queue on reconnect', type: 'task', blockedBy: ['queue'] },
      ],
    });
    expect(proposed).toMatchObject({ id: 'R-1', status: 'pending', frozen: [key('batch')] });
    expect(fs.readFileSync(path.join(root, mapId, 'map.md'), 'utf8')).toBe(before);
    await expect(call('claim_ticket', { ticket: key('batch') })).rejects.toThrow(/frozen by reroute proposal R-1/);
    const next = await call<{ ticket: { key: string } }>('next_ticket');
    expect(next.ticket.key).toBe(key('docs'));
    expect(await call('status')).toMatchObject({
      adaptive: { pendingReroutes: [{ id: 'R-1', frozen: [key('batch')] }] },
    });

    const listedRoute = await get(`/reroutes?map=${mapId}`);
    expect(listedRoute).toMatchObject({ pending: 1, reroutes: [{ id: 'R-1', frozen: [expect.any(String)] }] });
    expect((await post('/reroutes/reject', { mapId, id: 'R-1' })).status).toBe(409);
    expect((await post('/reroutes/approve', { mapId, id: 'R-1' })).body).toMatchObject({
      reroute: { status: 'approved' },
    });

    const decided = await call<{ reroute: { status: string; created: string[] } }>('reroute_status', {
      wait: true,
      waitSeconds: 1,
    });
    expect(decided.reroute.status).toBe('approved');
    expect(decided.reroute.created).toHaveLength(2);
    const claimed = await call<{ claimed: { title: string } }>('claim_ticket', { ticket: decided.reroute.created[0] });
    expect(claimed.claimed.title).toBe('Queue single writes');
    expect(await get(`/assumptions?map=${mapId}`)).toMatchObject({
      assumptions: [{ id: 'S-1', status: 'invalidated' }],
    });
  });

  it('a reroute edits a ticket, removes a dependency and reopens finished work, once approved', async () => {
    const call = await connect();
    const started = await call<Started>('start_trail', {
      discovery: false,
      title: 'Batch sync',
      destination: 'Edits sync in batches',
      tickets: [
        { ref: 'look', title: 'Check the v2 API', type: 'research' },
        { ref: 'batch', title: 'Batch writes', type: 'execute', blockedBy: ['look'] },
        { ref: 'docs', title: 'Write the docs', type: 'task' },
      ],
    });
    const mapId = started.trail.id;
    const key = (ref: string) => started.tickets.find((t) => t.ref === ref)!.key;
    const file = (ref: string) => fs.readFileSync(path.join(root, mapId, 'tickets', `${key(ref).slice(1)}.md`), 'utf8');
    await call('claim_ticket', { ticket: key('look') });
    await call('close_ticket', { resolution: 'v2 looks fine.' });
    expect(file('look')).toMatch(/state: closed/);

    const proposed = await call<{ id: string; status: string; frozen: string[] }>('propose_reroute', {
      reason: 'The API check missed rate limits, and the docs ticket is really a runbook',
      evidence: 'docs/v2.md: 10 writes per second',
      changes: [
        { op: 'edit_ticket', ticket: key('docs'), title: 'Write the runbook', body: 'Rate limits and retries.' },
        { op: 'rewire', ticket: key('batch'), removeBlockedBy: [key('look')] },
        { op: 'reopen', ticket: key('look'), reason: 'Check the rate limits too' },
      ],
    });
    expect(proposed).toMatchObject({ status: 'pending' });
    expect(file('docs')).toMatch(/title: Write the docs/);
    expect(file('batch')).toMatch(new RegExp(`blocked_by:.*${key('look').slice(1)}`));
    await post('/reroutes/approve', { mapId, id: proposed.id });

    expect(file('docs')).toMatch(/title: Write the runbook/);
    expect(file('docs')).toContain('Rate limits and retries.');
    expect(file('batch')).not.toMatch(new RegExp(`blocked_by:.*${key('look').slice(1)}`));
    expect(file('look')).toMatch(/state: open/);
    const claimed = await call<{ claimed: { key: string } }>('claim_ticket', { ticket: key('look') });
    expect(claimed.claimed.key).toBe(key('look'));
  });

  it('seeds the trail assumptions from the brief when the trail lead accepts it', async () => {
    const call = await connect();
    const started = await call<Started>('start_trail', {
      title: 'Reminders',
      destination: 'Clients get reminders',
      tickets: [{ ref: 'b', title: 'Build the scheduler', type: 'execute' }],
    });
    await call('submit_brief', {
      summary: 'Scheduler next to the notify service.',
      existing: '- src/notify/service.ts',
      assumptions: ['Push is the default channel', 'Jobs run every minute'],
    });
    // The trail lead accepts the brief they were shown (its hash, from GET).
    const { hash } = await get(`/briefs?mapId=${started.trail.id}`);
    const r = await post('/briefs/accept', { mapId: started.trail.id, hash });
    expect(r.body.assumptions).toHaveLength(2);
    await post('/briefs/accept', { mapId: started.trail.id, hash });
    const listed = await call<{ assumptions: { id: string; source: string }[] }>('list_assumptions');
    expect(listed.assumptions.map((a) => `${a.id} ${a.source}`)).toEqual(['S-1 brief:A-1', 'S-2 brief:A-2']);
  });
});
