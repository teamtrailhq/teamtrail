import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { decided, MarkdownAdapter } from '@teamtrail/core';
import { approvalItems, readBrief, writeBrief, writeKnowledge } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

let repo: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];

async function connect(agentName = 'claude-01') {
  const agent = new TrailAgent({ root, agent: agentName, pollMs: 20 });
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

function writeConfig(level = 'checks') {
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      default: level,
      checks: {
        check: { run: [process.execPath, '-e', "process.exit(require('fs').existsSync('fixed.txt') ? 0 : 1)"] },
      },
      run: ['check'],
    }),
  );
  approveAllHere(root);
}

const acceptBrief = (mapId: string, call: (n: string, a?: Record<string, unknown>) => Promise<unknown>) =>
  call('submit_brief', { summary: 'Search page.', existing: '- `src/search.ts`' }).then(() => {
    writeBrief(root, decided(readBrief(root, mapId)!, { kind: 'accept' }));
    approveAllHere(root);
  });

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-criteria-'));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(repo, 'fixed.txt'), 'ok');
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

type Done = { status?: string; note?: string; feedback?: unknown };
type Claimed = {
  claimed: { key: string };
  criteria?: { required: boolean; next?: string; suggested?: { source: string }[] };
};

describe('acceptance criteria over MCP', () => {
  it('are required before completing, need evidence each, and manual ones wait for the human', async () => {
    writeConfig();
    const now = Date.now();
    writeKnowledge(root, {
      id: 'K-1',
      title: 'Never show another team’s releases',
      body: 'Search is scoped to the team.',
      kind: 'business-rule',
      status: 'confirmed',
      scope: [],
      tags: ['search'],
      sources: [],
      anchors: [],
      createdBy: 'trail lead',
      createdAt: now,
      updatedAt: now,
    });
    const call = await connect();
    const m = await call<{ trail: { id: string }; tickets: { key: string; type: string }[] }>('start_trail', {
      title: 'Search',
      destination: 'Find a release by keyword',
      tickets: [{ ref: 'build', title: 'Build search', type: 'execute' }],
    });
    await acceptBrief(m.trail.id, call);
    const build = m.tickets.find((t) => t.type === 'execute')!.key;

    const claimed = await call<Claimed>('claim_ticket', { ticket: build });
    expect(claimed.criteria?.required).toBe(true);
    expect(claimed.criteria?.next).toMatch(/set_criteria/);
    expect(claimed.criteria?.suggested?.map((s) => s.source)).toEqual(['K-1']);
    await expect(call('report_completion', { resolution: 'Built it' })).rejects.toThrow(/needs acceptance criteria/);

    await call('set_criteria', {
      ticket: build,
      criteria: [
        { text: 'Finds a release by a word in its title', kind: 'unit' },
        { text: 'Never show another team’s releases', kind: 'business-rule', source: 'K-1' },
        { text: 'The owner approves the empty-state copy', kind: 'manual' },
      ],
    });
    const missing = await call<Done>('report_completion', {
      resolution: 'Built it',
      criteria: [{ id: 'AC-1', evidence: 'check:check' }],
    });
    expect(missing.status).toBe('rework');
    expect(JSON.stringify(missing)).toMatch(/AC-2/);

    await call('claim_ticket', { ticket: build });
    const passed = await call<Done>('report_completion', {
      resolution: 'Built it',
      criteria: [
        { id: 'AC-1', evidence: 'check:check' },
        { id: 'AC-2', evidence: 'test:search is scoped to the team' },
        { id: 'AC-3', evidence: 'manual' },
      ],
    });
    expect(passed.status).toBe('verifying');
    const snap = await new MarkdownAdapter(nodeMarkdownFs(root), root).loadMap(m.trail.id);
    // AC-2 is a business rule backed only by the agent's word: the human signs it off with AC-3.
    expect(approvalItems(root, snap)).toEqual([
      expect.objectContaining({
        kind: 'approve',
        ticketKey: build,
        reason: expect.stringMatching(/^Sign off AC-2, AC-3/),
      }),
    ]);
  });

  it('cross-vendor review: work by Claude is left for a connected Codex agent to review', async () => {
    writeConfig('checks+review');
    const claude = await connect('claude-01');
    const m = await claude<{ tickets: { key: string; type: string; title: string }[] }>('start_trail', {
      discovery: false,
      title: 'Search',
      destination: 'D',
      tickets: [
        { ref: 'build', title: 'Build search', type: 'execute' },
        { ref: 'look', title: 'Look at prior art', type: 'research' },
        { ref: 'more', title: 'More research', type: 'research' },
      ],
    });
    const build = m.tickets.find((t) => t.type === 'execute')!.key;
    await claude('claim_ticket', { ticket: build });
    expect((await claude<Done>('report_completion', { resolution: 'Built it' })).status).toBe('verifying');

    const codex = await connect('codex-01');
    await codex('claim_ticket', { ticket: m.tickets.find((t) => t.title === 'Look at prior art')!.key });
    const claude2 = await connect('claude-02');
    const forClaude = await claude2<{ ticket: { type: string } | null }>('next_ticket');
    expect(forClaude.ticket?.type).not.toBe('review');
    const forCodex = await codex<{ ticket: { type: string } | null }>('next_ticket');
    expect(forCodex.ticket?.type).toBe('review');
  });
});
