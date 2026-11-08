import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { setModelMatching } from '@teamtrail/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';

let root: string;
const open: { close(): void | Promise<void> }[] = [];
type Call = <T = Record<string, unknown>>(name: string, args?: Record<string, unknown>) => Promise<T>;

/** An agent whose log says it runs on `model` (none: it reports no model). */
async function connect(agentName: string, model?: string): Promise<{ call: Call; agent: TrailAgent }> {
  const usage = { noteCall: () => undefined, measure: () => undefined, model: () => model };
  const agent = new TrailAgent({ root, agent: agentName, pollMs: 20, usage });
  const server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  const call: Call = async (name, args = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text);
  };
  return { call, agent };
}

beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-models-')), '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

type Next = {
  ticket: { key: string; type: string } | null;
  tier?: { session: string; ticket: string };
  reason?: string;
};
type Claim = { claimed: { key: string; type: string }; tier?: { session: string; ticket: string }; tierNote?: string };

async function trail(call: Call) {
  const started = await call<{ trail: { id: string } }>('start_trail', {
    discovery: false,
    title: 'Search',
    destination: 'Readers find a release',
    tickets: [
      { ref: 'r', title: 'Survey release sizes', type: 'research' },
      { ref: 'j', title: 'Pick the index format', type: 'junction' },
      { ref: 't', title: 'Search box', type: 'task' },
    ],
  });
  return started.trail.id;
}

describe('model-aware claiming over MCP', () => {
  it('with matching off, claiming is as before and results carry no tier', async () => {
    const fast = await connect('claude-01', 'claude-haiku-4-5');
    await trail(fast.call);
    const next = await fast.call<Next>('next_ticket');
    expect(next.ticket?.type).toBe('research');
    expect(next.tier).toBeUndefined();
    const status = await fast.call<{ modelMatching: { enabled: boolean; session: { tier: string } } }>('status');
    expect(status.modelMatching.enabled).toBe(false);
    expect(status.modelMatching.session.tier).toBe('fast');
  });

  it('offers each session the tickets that fit its model, and an explicit claim still works with a note', async () => {
    const fast = await connect('claude-01', 'claude-haiku-4-5');
    const strong = await connect('claude-02', 'claude-opus-4-1');
    const unknown = await connect('codex-01');
    const mapId = await trail(fast.call);
    await setModelMatching(fast.agent.adapter, mapId, { enabled: true }, 'trail lead');

    const j = await strong.call<Claim>('claim_ticket');
    expect(j.claimed.type).toBe('junction');
    expect(j.tier).toEqual({ session: 'strongest', ticket: 'strongest', model: 'claude-opus-4-1' });
    const t = await unknown.call<Claim>('claim_ticket');
    expect(t.claimed.type).toBe('task');
    expect(t.tier).toMatchObject({ session: 'balanced', ticket: 'balanced' });
    const r = await fast.call<Claim>('claim_ticket');
    expect(r.claimed.type).toBe('research');
    expect(r.tierNote).toBeUndefined();

    const status = await strong.call<{ modelMatching: { enabled: boolean; tiers: Record<string, string> } }>('status');
    expect(status.modelMatching.enabled).toBe(true);
    expect(status.modelMatching.tiers).toMatchObject({ research: 'fast', junction: 'strongest', task: 'balanced' });
  });

  it('a strong session takes lower-tier work when nothing at its tier is ready; a fast one never takes higher', async () => {
    const fast = await connect('claude-01', 'claude-haiku-4-5');
    const strong = await connect('claude-02', 'claude-opus-4-1');
    const mapId = await trail(fast.call);
    await setModelMatching(fast.agent.adapter, mapId, { enabled: true }, 'trail lead');

    expect((await strong.call<Claim>('claim_ticket')).claimed.type).toBe('junction');
    expect((await strong.call<Claim>('claim_ticket')).claimed.type).toBe('task');
    const next = await fast.call<Next>('next_ticket');
    expect(next.ticket?.type).toBe('research');
    expect((await strong.call<Claim>('claim_ticket')).claimed.type).toBe('research');

    const second = await fast.call<{ trail: { id: string } }>('start_trail', {
      discovery: false,
      title: 'Pricing',
      destination: 'Plans are clear',
      tickets: [{ ref: 'j', title: 'Pick the plans', type: 'junction' }],
    });
    await setModelMatching(fast.agent.adapter, second.trail.id, { enabled: true }, 'trail lead');
    const none = await fast.call<Next>('next_ticket', { trail: second.trail.id });
    expect(none.ticket).toBeNull();
    expect(none.reason).toMatch(/set for a stronger model, and this session runs fast/);
    await expect(fast.call('claim_ticket', { trail: second.trail.id })).rejects.toThrow(/stronger model/);
    const key = (await fast.call<{ trail: { ready: { key: string }[] } }>('status', { trail: second.trail.id })).trail
      .ready[0].key;
    const explicit = await fast.call<Claim>('claim_ticket', { trail: second.trail.id, ticket: key });
    expect(explicit.claimed.key).toBe(key);
    expect(explicit.tierNote).toMatch(/set for strongest; this session runs fast/);
  });

  it("follows the trail's own tiers and the project's models.json", async () => {
    fs.writeFileSync(path.join(root, 'models.json'), JSON.stringify({ v: 1, models: { 'acme-*': 'strongest' } }));
    const custom = await connect('claude-01', 'acme-large');
    const mapId = await trail(custom.call);
    await setModelMatching(
      custom.agent.adapter,
      mapId,
      { enabled: true, tiers: { research: 'strongest' } },
      'trail lead',
    );
    const next = await custom.call<Next>('next_ticket');
    expect(next.ticket?.type).toBe('research');
    expect(next.tier).toEqual({ session: 'strongest', ticket: 'strongest', model: 'acme-large' });
  });
});
