import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';

let root: string;
const open: { close(): void | Promise<void> }[] = [];
type Call = <T = Record<string, unknown>>(name: string, args?: Record<string, unknown>) => Promise<T>;

async function connect(agentName: string): Promise<Call> {
  const agent = new TrailAgent({ root, agent: agentName, pollMs: 20 });
  const server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return async (name, args = {}) => {
    const r = (await callTool(client, root, name, args)) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text);
  };
}

beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-review-limit-')), '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

const setLimit = (reviewLimit: number | null) =>
  fs.writeFileSync(path.join(root, 'attention.json'), JSON.stringify({ v: 1, reviewLimit }));

/** A done ticket whose pull request still waits for review, as the PR reconciler records it. */
function openPr(mapId: string, ticketId: string) {
  const dir = path.join(root, '.evidence', mapId, ticketId);
  fs.mkdirSync(dir, { recursive: true });
  const flag = { kind: 'done-pr-open', severity: 'warn', text: 'PR open', since: Date.now() - 60_000 };
  const sync = { v: 1, mapId, ticketId, ticketKey: `#${ticketId}`, provider: 'github', link: {}, checks: [] };
  fs.writeFileSync(path.join(dir, 'sync.json'), JSON.stringify({ ...sync, checksSummary: 'none', flags: [flag] }));
}

type Next = { ticket: { key: string; type: string } | null; reason?: string; reviewLimit?: string };

async function trail(call: Call) {
  const started = await call<{ trail: { id: string } }>('start_trail', {
    discovery: false,
    title: 'Search',
    destination: 'Readers find a release',
    tickets: [
      { ref: 'r', title: 'Survey release sizes', type: 'research' },
      { ref: 't', title: 'Search box', type: 'task' },
      { ref: 'e', title: 'Index releases', type: 'execute' },
    ],
  });
  return started.trail.id;
}

describe('the review limit over MCP', () => {
  it('stops new implementation work while finished work waits, and says why', async () => {
    const call = await connect('claude-01');
    const mapId = await trail(call);
    const task = (await call<Next>('next_ticket', { types: ['task'] })).ticket!;
    setLimit(2);
    openPr(mapId, 'done-1');
    openPr(mapId, 'done-2');

    const next = await call<Next>('next_ticket');
    expect(next.ticket?.type).toBe('research');
    expect(next.reviewLimit).toContain('Review limit reached: 2 finished tickets wait');

    const impl = await call<Next>('next_ticket', { types: ['task', 'execute'] });
    expect(impl.ticket).toBeNull();
    expect(impl.reason).toContain("the team's limit is 2");

    await expect(call('claim_ticket', { ticket: task.key })).rejects.toThrow(/Review limit reached/);

    const research = await call<{ claimed: { type: string } }>('claim_ticket');
    expect(research.claimed.type).toBe('research');
  });

  it('lets work start again once the queue is under the limit, or the limit is off', async () => {
    const call = await connect('claude-01');
    const mapId = await trail(call);
    openPr(mapId, 'done-1');
    openPr(mapId, 'done-2');

    setLimit(3);
    const under = await call<Next>('next_ticket', { types: ['task'] });
    expect(under.ticket?.type).toBe('task');
    expect(under.reviewLimit).toBeUndefined();

    setLimit(null);
    const off = await call<Next>('next_ticket', { types: ['task'] });
    expect(off.ticket?.type).toBe('task');
  });
});
