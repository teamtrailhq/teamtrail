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

async function connect(agentName: string) {
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-attention-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

interface Item {
  id: string;
  kind: string;
  urgency: string;
  reasons: string[];
  questionId?: string;
  ticket?: string;
}
type Inbox = { questions: { questionId: string; question: string }[]; attention: { items: Item[] } };

describe('attention over MCP', () => {
  it('ranks questions by urgency and what they hold up, and old clients still work', async () => {
    const worker = await connect('claude-01');
    const started = await worker<{ tickets: { key: string; title: string }[] }>('start_trail', {
      discovery: false,
      title: 'Reminders',
      destination: 'Clients get reminders they asked for',
      tickets: [
        { ref: 'a', title: 'Pick the channel', type: 'task' },
        { ref: 'b', title: 'Build the scheduler', type: 'task', blockedBy: ['a'] },
        { ref: 'c', title: 'Send the reminders', type: 'task', blockedBy: ['b'] },
      ],
    });
    const key = (title: string) => started.tickets.find((t) => t.title === title)!.key;
    await worker('claim_ticket', { ticket: key('Pick the channel') });
    const asked = await worker<{ answered: boolean; questionId: string }>('ask_human', {
      question: 'SMS or push?',
      urgency: 'blocking',
      blocks: [key('Build the scheduler')],
      waitSeconds: 0,
    });
    expect(asked.answered).toBe(false);

    const other = await connect('codex-01');
    await other('ask_human', { question: 'Name the feature flag?', framing: true, waitSeconds: 0 });

    const inbox = await other<Inbox>('list_inbox');
    expect(inbox.questions.map((q) => q.question).sort()).toEqual(['Name the feature flag?', 'SMS or push?']);
    const questions = inbox.attention.items.filter((i) => i.kind === 'question');
    expect(questions[0]).toMatchObject({
      questionId: asked.questionId,
      urgency: 'blocking',
      ticket: key('Pick the channel'),
    });
    expect(questions[0].reasons).toEqual(expect.arrayContaining(['marked blocking', 'blocks 2 tickets']));
    expect(questions[1]).toMatchObject({ urgency: 'soon' });

    const onlyQuestions = await other<Inbox>('list_inbox', { kinds: ['question'] });
    expect(onlyQuestions.attention.items.every((i) => i.kind === 'question')).toBe(true);

    const status = await worker<{ attention: { count: number; top: Item[] } }>('status');
    expect(status.attention.count).toBe(inbox.attention.items.length);
    expect(status.attention.top[0].questionId).toBe(asked.questionId);
  });
});
