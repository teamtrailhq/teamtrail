import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';

let repo: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];

async function connect() {
  const agent = new TrailAgent({ root, agent: 'claude-01', pollMs: 20 });
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
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-precedent-'));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

type Asked = { answered: boolean; questionId: string; note?: string; precedents?: { id: string; reasons: string[] }[] };

describe('decision memory over MCP', () => {
  it('a question an earlier decision already answers comes back with the precedent instead of reaching the human', async () => {
    const call = await connect();
    const m = await call<{ tickets: { key: string }[] }>('start_trail', {
      discovery: false,
      title: 'Free shipping',
      destination: 'Free shipping over $50',
      tickets: [{ ref: 'a', title: 'Apply the threshold', type: 'execute' }],
    });
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const recorded = await call<{ decision: { id: string } }>('record_decision', {
      ticket: m.tickets[0].key,
      question: 'Does the $50 threshold count before or after discounts?',
      answer: 'After discounts, so a $60 cart with a $15 coupon pays shipping.',
      category: 'product-behaviour',
    });
    const id = recorded.decision.id;

    const asked = await call<Asked>('ask_human', {
      question: 'Should the $50 free shipping threshold count after discounts?',
      category: 'product-behaviour',
      waitSeconds: 0,
    });
    expect(asked.answered).toBe(false);
    expect(asked.questionId).toBe('');
    expect(asked.precedents?.[0]).toMatchObject({ id });
    expect(asked.precedents?.[0].reasons[0]).toBe('decided on this ticket, also product-behaviour');
    expect(asked.note).toContain(`Not asked: ${id} already decided`);

    const found = await call<{ precedents: { id: string; strength: string }[] }>('find_precedent', {
      text: 'Is the threshold after discounts?',
      categories: ['product-behaviour'],
    });
    expect(found.precedents[0]).toMatchObject({ id, strength: 'strong' });

    const anyway = await call<Asked>('ask_human', {
      question: 'The coupon rules changed: should the $50 threshold still count after discounts?',
      category: 'product-behaviour',
      askAnyway: true,
      waitSeconds: 0,
    });
    expect(anyway.questionId).not.toBe('');
    const dir = path.join(root, '.agents', 'sessions');
    const pending = fs
      .readdirSync(dir)
      .flatMap(
        (f) =>
          (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { pending: { precedent?: string }[] }).pending,
      );
    expect(pending.map((q) => q.precedent)).toContainEqual(
      expect.stringMatching(new RegExp(`^${id} already decided: `)),
    );
  });

  it('a different question on another subject is asked as usual', async () => {
    const call = await connect();
    await call('start_trail', {
      discovery: false,
      title: 'Search',
      destination: 'Search results',
      tickets: [{ ref: 'a', title: 'Rank results', type: 'execute' }],
    });
    const asked = await call<Asked>('ask_human', { question: 'Which font for headings?', waitSeconds: 0 });
    expect(asked.questionId).not.toBe('');
    expect(asked.precedents).toBeUndefined();
  });
});
