import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter, type TicketLease } from '@teamtrail/core';
import { readLeases } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';

let root: string;
const open: { close(): void | Promise<void> }[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect(agentName: string, leaseMs: number) {
  const agent = new TrailAgent({ root, agent: agentName, pollMs: 20, leaseMs });
  const server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return async <T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) => {
    const r = (await callTool(client, root, name, args)) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}

type Claimed = {
  claimed: { key: string; assignee: string; resume?: { handoff: string }; decisionsSoFar: { id: string }[] };
  recovered?: { ticket: string; from: string }[];
};

async function trail(call: Awaited<ReturnType<typeof connect>>) {
  await call('start_trail', {
    discovery: false,
    title: 'Offline sync',
    destination: 'Edits made offline survive',
    tickets: [{ ref: 'r', title: 'Survey CRDT libraries', type: 'research' }],
  });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-lease-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('claim leases', () => {
  it('returns a silent agent’s ticket to the queue and hands its notes to the next agent', async () => {
    const a = await connect('claude-01', 150);
    await trail(a);
    const first = await a<Claimed & { lease: { length: string } }>('claim_ticket');
    await a('report_progress', { step: 'Investigate', message: 'Yjs and Automerge both fit' });
    await a('record_decision', {
      question: 'Which CRDT?',
      answer: 'Yjs',
      summary: 'Use Yjs',
      ticket: first.claimed.key,
    });
    expect(readLeases(root)[0]).toMatchObject({ agent: 'claude-01', notes: ['Yjs and Automerge both fit'] });

    // claude-01 crashes: no more calls. A second agent asks for work after the lease ran out.
    await sleep(250);
    const b = await connect('claude-02', 60_000);
    const next = await b<{ ticket: { key: string }; recovered: { ticket: string; from: string }[] }>('next_ticket');
    expect(next.recovered).toEqual([expect.objectContaining({ ticket: first.claimed.key, from: 'claude-01' })]);
    expect(next.ticket.key).toBe(first.claimed.key);

    const second = await b<Claimed>('claim_ticket');
    expect(second.claimed.assignee).toBe('claude-02');
    expect(second.claimed.resume?.handoff).toMatch(/claude-01 went silent/);
    expect(second.claimed.resume?.handoff).toMatch(/Yjs and Automerge both fit/);
    // D-1 is the human's answer to skip discovery (fakes/callTool.ts).
    expect(second.claimed.resume?.handoff).toMatch(/D-2 · Use Yjs/);
    expect(second.claimed.decisionsSoFar.map((d) => d.id)).toEqual(['D-2']);
    const leases = readLeases(root);
    expect(leases.map((l: TicketLease) => [l.agent, l.returned?.reason ?? 'live'])).toEqual([['claude-02', 'live']]);

    // claude-01 comes back: told once that its claim is gone.
    const late = await a<{ leaseLost?: { tickets: string[] } }>('report_progress', { message: 'back' });
    expect(late.leaseLost?.tickets).toEqual([first.claimed.key]);
    expect((await a<{ leaseLost?: unknown }>('report_progress', { message: 'again' })).leaseLost).toBeUndefined();
  });

  it('keeps the claim while the agent keeps calling tools', async () => {
    const a = await connect('claude-01', 200);
    await trail(a);
    await a('claim_ticket');
    for (let i = 0; i < 5; i++) {
      await sleep(80);
      await a('report_progress', { message: `step ${i}` });
    }
    const b = await connect('claude-02', 60_000);
    const next = await b<{ ticket: null; recovered?: unknown }>('next_ticket');
    expect(next).toMatchObject({ ticket: null });
    expect(next.recovered).toBeUndefined();
    const snap = await new MarkdownAdapter(nodeMarkdownFs(root)).loadMap(
      (await b<{ trail: { id: string } }>('status')).trail.id,
    );
    expect(snap.tickets[0].assignee).toBe('claude-01');
  });

  it('drops the lease when the agent closes or releases its ticket', async () => {
    const a = await connect('claude-01', 60_000);
    await trail(a);
    await a('claim_ticket');
    expect(readLeases(root)).toHaveLength(1);
    await a('release_ticket', {});
    expect(readLeases(root)).toHaveLength(0);
    await a('claim_ticket');
    await a('close_ticket', { resolution: 'Use Yjs.' });
    expect(readLeases(root)).toHaveLength(0);
  });
});
