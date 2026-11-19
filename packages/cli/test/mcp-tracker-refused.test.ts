import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { refusedWrites } from '@teamtrail/core/bridge';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';

let root: string;
const open: { close(): void | Promise<void> }[] = [];

async function connect(name: string) {
  const agent = new TrailAgent({ root, agent: name, pollMs: 20 });
  const server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const r = (await callTool(client, root, tool, args)) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as { trackerRefused?: { writes: { write: string; error: string }[] } };
  };
  return { agent, call };
}

/** GitHub refused a claim the agent with `origin` queued, as the adapter that sent it keeps it. */
const refuse = (origin: string, id: string) =>
  refusedWrites(root).add({
    write: {
      id,
      mapId: '1',
      label: 'claim #2',
      at: Date.now(),
      change: { kind: 'claim', ticketId: '2', assignee: 'claude-01', was: null },
      by: 'agent claude-01 via MCP',
      origin,
    },
    tracker: 'github',
    key: 'github-octo-org_launchpad',
    error: 'GitHub: Resource not accessible by integration',
    at: Date.now(),
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-refused-mcp-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a tracker write refused for good', () => {
  it('is told to the agent that made it on its next call, once, and to no other agent', async () => {
    const mine = await connect('claude-01');
    const other = await connect('codex-02');
    refuse(mine.agent.origin, 'w1');

    const told = await mine.call('status');
    expect(told.trackerRefused?.writes).toEqual([
      { write: 'claim #2', tracker: 'GitHub', error: 'GitHub: Resource not accessible by integration' },
    ]);
    expect((await mine.call('status')).trackerRefused).toBeUndefined();
    expect((await other.call('status')).trackerRefused).toBeUndefined();

    refuse(mine.agent.origin, 'w2');
    expect((await mine.call('status')).trackerRefused?.writes).toHaveLength(1);
  });
});
