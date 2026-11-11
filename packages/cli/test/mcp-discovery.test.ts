import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { decided, parseBrief, serializeBrief } from '@teamtrail/core';
import { briefPath, readBrief, writeBrief } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

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

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-discovery-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

type Started = {
  trail: { id: string };
  tickets: { key: string; title: string; type: string }[];
  discovery: { status: string };
  skipDiscovery?: { request: string };
};

describe('discovery brief over MCP', () => {
  it('gates implementation until the human accepts the brief', async () => {
    const call = await connect();
    const started = await call<Started>('start_trail', {
      title: 'Reminders',
      destination: 'Clients get reminders they asked for',
      tickets: [
        { ref: 'build', title: 'Build the reminder scheduler', type: 'execute' },
        { ref: 'look', title: 'How do notifications work today?', type: 'research' },
      ],
    });
    const mapId = started.trail.id;
    expect(started.discovery.status).toBe('draft');
    const discovery = started.tickets.find((t) => t.title.startsWith('Discovery brief'));
    const build = started.tickets.find((t) => t.type === 'execute')!;
    expect(discovery?.type).toBe('research');

    // Implementation is held back; next_ticket only offers investigation.
    await expect(call('claim_ticket', { ticket: build.key })).rejects.toThrow(/accepted discovery brief/);
    const next = await call<{ ticket: { type: string } }>('next_ticket');
    expect(next.ticket.type).toBe('research');

    // A brief needs real content.
    await expect(call('submit_brief', { summary: 'x', existing: '' })).rejects.toThrow();
    const sent = await call<{ brief: { status: string } }>('submit_brief', {
      summary: 'Add a scheduler next to the existing notification service.',
      existing: '- src/notify/service.ts: sends push and SMS',
      productContext: 'Clients opt in per channel; SMS costs money.',
      assumptions: ['Push is the default channel'],
      openQuestions: ['Quiet hours?'],
    });
    expect(sent.brief.status).toBe('submitted');
    await expect(call('claim_ticket', { ticket: build.key })).rejects.toThrow(/waiting for the human/);

    // The trail lead asks for changes; the agent sees the note.
    writeBrief(root, decided(readBrief(root, mapId)!, { kind: 'request-changes', note: 'Cover quiet hours' }));
    const read = await call<{ status: string; changesRequested: string; sections: { assumptions: { id: string }[] } }>(
      'get_brief',
    );
    expect(read.status).toBe('changes-requested');
    expect(read.changesRequested).toBe('Cover quiet hours');
    expect(read.sections.assumptions.map((a) => a.id)).toEqual(['A-1']);

    // Resubmitted and accepted: implementation opens up.
    await call('submit_brief', { summary: 'Scheduler with quiet hours.', existing: '- src/notify/service.ts' });
    writeBrief(root, decided(readBrief(root, mapId)!, { kind: 'accept' }));
    approveAllHere(root);
    const claimed = await call<{ claimed: { key: string }; discovery: { implementationClaimable: boolean } }>(
      'claim_ticket',
      { ticket: build.key },
    );
    expect(claimed.claimed.key).toBe(build.key);
    expect(claimed.discovery.implementationClaimable).toBe(true);
    await expect(call('submit_brief', { summary: 'again', existing: 'x' })).rejects.toThrow(/already accepted/);
  });

  it('skips discovery when asked, and leaves trails without a brief alone', async () => {
    const call = await connect();
    const started = await call<Started>('start_trail', {
      discovery: false,
      title: 'Typo fix sweep',
      destination: 'No typos in the docs',
      tickets: [{ ref: 'fix', title: 'Fix typos', type: 'task' }],
    });
    // Asked to skip it, the trail starts with discovery last and a request; the trail lead approved it in the
    // Lookout (fakes/callTool.ts): the brief is gone and the discovery ticket ruled out.
    expect(started.skipDiscovery).toBeTruthy();
    expect(started.tickets.at(-1)?.title).toMatch(/^Discovery brief/);
    expect(fs.existsSync(briefPath(root, started.trail.id))).toBe(false);
    const claimed = await call<{ claimed: { title: string } }>('claim_ticket');
    expect(claimed.claimed.title).toBe('Fix typos');
  });

  it('round-trips the brief file', () => {
    const b = decided(
      {
        mapId: 'm1',
        status: 'submitted',
        ticketId: '7',
        author: 'claude-01',
        submittedAt: Date.UTC(2026, 10, 3),
        sections: {
          summary: 'S',
          productContext: 'P',
          existing: '- a.ts',
          conventions: '',
          dataModel: '',
          api: '',
          risks: 'R',
          assumptions: [{ id: 'A-1', text: 'one' }],
          openQuestions: ['q?'],
        },
      },
      { kind: 'request-changes', note: 'More: on risks, please' },
      Date.UTC(2026, 10, 4),
    );
    expect(parseBrief('m1', serializeBrief(b))).toEqual(b);
  });
});
