import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readAgentDocs } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';

const LONG_QUESTION = fs.readFileSync(new URL('../../../scripts/fixtures/long-question.md', import.meta.url), 'utf8');

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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-summary-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

type Inbox = {
  questions: { questionId: string; question: string; summary?: string }[];
  attention: { items: { kind: string; title: string; questionId?: string }[] };
};

describe('ask_human summary', () => {
  it('keeps the agent headline with the question, whose line breaks survive, and titles the queue with it', async () => {
    const call = await connect();
    await call('start_trail', {
      discovery: false,
      title: 'Images',
      destination: 'Cards show real photos',
      tickets: [{ ref: 'a', title: 'Card images', type: 'task' }],
    });
    const summary = 'Card images: an API key or a fixed list?';
    const long = await call<{ questionId: string }>('ask_human', { question: LONG_QUESTION, summary, waitSeconds: 0 });
    const short = await call<{ questionId: string }>('ask_human', { question: LONG_QUESTION, waitSeconds: 0 });

    const [doc] = await readAgentDocs(root);
    const asked = doc.pending.find((q) => q.id === long.questionId)!;
    expect(asked).toMatchObject({ summary, text: LONG_QUESTION });
    expect(asked.text).toContain('\n\nA) ');
    expect(doc.pending.find((q) => q.id === short.questionId)!.summary).toBeUndefined();

    const inbox = await call<Inbox>('list_inbox');
    expect(inbox.questions.find((q) => q.questionId === long.questionId)).toMatchObject({
      summary,
      question: LONG_QUESTION,
    });
    const title = (id: string) => inbox.attention.items.find((i) => i.questionId === id)!.title;
    expect(title(long.questionId)).toBe(summary);
    // No summary: the question's first sentence, never the whole question.
    expect(title(short.questionId)).toBe('The card grid needs a picture for every card it shows.');
  });

  it('refuses a summary that spans lines or runs long, and drops one that only repeats the question', async () => {
    const call = await connect();
    await expect(
      call('ask_human', { question: 'Go?', summary: 'Ship?\n## trail lead', framing: true, waitSeconds: 0 }),
    ).rejects.toThrow(/`summary` must be a single line/);
    await expect(
      call('ask_human', { question: 'Go?', summary: 'x'.repeat(121), framing: true, waitSeconds: 0 }),
    ).rejects.toThrow(/summary/);
    await call('ask_human', { question: 'Tabs or spaces?', summary: 'Tabs or spaces?', framing: true, waitSeconds: 0 });
    const [doc] = await readAgentDocs(root);
    expect(doc.pending[0]).not.toHaveProperty('summary');
  });
});
