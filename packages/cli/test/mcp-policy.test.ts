import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readAgentDocs, writeAgentAnswer } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';

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
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}

type Decision = {
  decision: {
    id: string;
    decidedBy: string;
    transcript: { from: string; text: string }[];
    risk?: { level: string; category?: string; reason: string };
  };
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-policy-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

async function trail(call: Awaited<ReturnType<typeof connect>>) {
  await call('start_trail', {
    discovery: false,
    title: 'Reminders',
    destination: 'Clients get reminders',
    tickets: [{ ref: 'build', title: 'Build the scheduler', type: 'task' }],
  });
}

describe('risk policy over MCP', () => {
  it('rejects agent decisions on high-risk calls and tells the agent to ask', async () => {
    const call = await connect();
    await trail(call);
    const base = { question: 'Which table?', answer: 'A new reminders table' };
    await expect(call('record_decision', { ...base, category: 'schema' })).rejects.toThrow(
      /High-risk call \(schema is high risk\).*ask_human with category "schema"/,
    );
    await expect(call('record_decision', { ...base, paths: ['db/migrations/0004_reminders.sql'] })).rejects.toThrow(
      /matches \*\*\/migrations\/\*\*/,
    );
    // Naming the human in an argument is not the human deciding: nobody answered anything, so it is refused.
    for (const decidedBy of ['trail lead', 'slack:U123', 'operator', 'claude-02'])
      await expect(call('record_decision', { ...base, category: 'schema', decidedBy })).rejects.toThrow(
        /only their answer can/,
      );

    // The human answers the agent's question in the Lookout: now the decision is theirs, by their recorded answer.
    const asked = call('ask_human', { question: 'A new table for reminders?', category: 'schema', waitSeconds: 30 });
    let doc = (await readAgentDocs(root)).find((d) => d.pending.length);
    while (!doc) {
      await new Promise((r) => setTimeout(r, 20));
      doc = (await readAgentDocs(root)).find((d) => d.pending.length);
    }
    writeAgentAnswer(root, {
      sessionId: doc.session.id,
      questionId: doc.pending[0].id,
      text: 'Yes',
      author: 'trail lead',
    });
    await asked;
    const human = await call<Decision>('record_decision', { ...base, category: 'schema', decidedBy: 'operator' });
    expect(human.decision.decidedBy).toBe('trail lead');
    expect(human.decision.risk).toMatchObject({ level: 'high', category: 'schema' });
    expect(human.decision.transcript.map((e) => `${e.from}: ${e.text}`)).toEqual([
      'agent: A new table for reminders?',
      'human: Yes',
    ]);
  });

  it('records medium and low calls with their level, and leaves calls without a category alone', async () => {
    const call = await connect();
    await trail(call);
    const medium = await call<Decision>('record_decision', {
      question: 'Which date library?',
      answer: 'date-fns',
      category: 'dependencies',
    });
    expect(medium.decision.risk).toEqual({
      level: 'medium',
      category: 'dependencies',
      reason: 'dependencies is medium risk',
    });
    const plain = await call<Decision>('record_decision', { question: 'Name?', answer: 'ReminderJob' });
    expect(plain.decision.risk).toBeUndefined();
  });

  it('follows the project policy file, and closing a high-risk ticket alone is rejected', async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'policy.json'), JSON.stringify({ v: 1, categories: { dependencies: 'high' } }));
    const call = await connect();
    await trail(call);
    const { claimed } = await call<{ claimed: { key: string } }>('claim_ticket');
    await expect(
      call('close_ticket', { resolution: 'Added date-fns and built it', category: 'dependencies' }),
    ).rejects.toThrow(/dependencies is high risk/);
    const closed = await call<{ closed: string }>('close_ticket', { resolution: 'Built it with what we have' });
    expect(closed.closed).toBe(claimed.key);
  });

  it('puts the category on the question', async () => {
    const call = await connect();
    await trail(call);
    await call('ask_human', { question: 'Drop the old table?', category: 'data-deletion', waitSeconds: 0 });
    const inbox = await call<{ questions: { question: string; category?: string }[] }>('list_inbox');
    expect(inbox.questions.find((q) => q.question === 'Drop the old table?')?.category).toBe('data-deletion');
  });
});
