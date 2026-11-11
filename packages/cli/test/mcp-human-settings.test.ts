import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter } from '@teamtrail/core';
import { readAgentDocs } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { answerInLookout } from './fakes/callTool';

/*
 * Skipping discovery, the trail's mode and its destination are the trail lead's settings. An agent, local or
 * remote, changes one only on the human's answer to a question asked about exactly that change, given in the
 * Lookout or Slack and not as an fyi; the change is kept as their decision, with the question as asked.
 */
let root: string;
const open: { close(): void | Promise<void> }[] = [];

/** A local agent, its calls made as they are: no test helper asks for it. */
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
type Call = Awaited<ReturnType<typeof connect>>;
type Asked = { questionId: string; answeredVia?: string };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-settings-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

const TRAIL = { title: 'Exports', destination: 'Clients export their data' };
const decisions = async () => {
  const adapter = new MarkdownAdapter(nodeMarkdownFs(root), root);
  const [map] = await adapter.listMaps();
  return adapter.listDecisions(map.id);
};

/** Asks about a setting and has the trail lead answer in the Lookout. */
async function askedInLookout(call: Call, args: Record<string, unknown>, stakes: RegExp, text = 'Yes') {
  const asked = call<Asked>('ask_human', { waitSeconds: 30, ...args });
  await answerInLookout(root, stakes, text);
  return (await asked).questionId;
}

describe('skipping discovery', () => {
  it('is refused without the human’s answer, saying how to ask', async () => {
    const call = await connect();
    await expect(call('start_trail', { ...TRAIL, discovery: false })).rejects.toThrow(
      /To skip discovery is the human's call\. Ask them with ask_human and about \{"kind":"skip-discovery"\}/,
    );
    expect(await readAgentDocs(root)).not.toContainEqual(expect.objectContaining({ pending: [expect.anything()] }));
  });

  it('shows the human what answering allows, and works on their Lookout answer, kept as their decision', async () => {
    const call = await connect();
    const asked = call<Asked>('ask_human', {
      question: 'This is a one-file change. Skip discovery?',
      about: { kind: 'skip-discovery' },
      framing: true,
      waitSeconds: 30,
    });
    let pending;
    while (!(pending = (await readAgentDocs(root)).flatMap((d) => d.pending)[0]))
      await new Promise((r) => setTimeout(r, 20));
    expect(pending.stakes).toBe('Answering this lets claude-01 skip discovery');
    await answerInLookout(root, /skip discovery/, 'Yes, skip it');
    const { questionId } = await asked;
    const started = await call<{ tickets: { title: string }[] }>('start_trail', {
      ...TRAIL,
      discovery: false,
      questionId,
    });
    expect(started.tickets.map((t) => t.title)).not.toContain('Discovery');
    const [rec] = await decisions();
    expect(rec).toMatchObject({
      decidedBy: 'trail lead',
      question: 'This is a one-file change. Skip discovery?',
      answer: 'Yes, skip it',
    });
    // one answer, one change
    await expect(call('start_trail', { ...TRAIL, discovery: false, questionId })).rejects.toThrow(/already backs/);
  });

  it('a chat answer, an fyi, or a question about something else doesn’t do', async () => {
    const call = await connect();
    const chat = await call<Asked>('ask_human', {
      question: 'Skip discovery?',
      about: { kind: 'skip-discovery' },
      framing: true,
      waitSeconds: 0,
    });
    await call('answer_question', { questionId: chat.questionId, answer: 'Yes' });
    await call('wait_for_answer', { questionId: chat.questionId, waitSeconds: 5 });
    await expect(call('start_trail', { ...TRAIL, discovery: false })).rejects.toThrow(/human's call/);
    await expect(call('start_trail', { ...TRAIL, discovery: false, questionId: chat.questionId })).rejects.toThrow(
      /guide agents but can't approve this/,
    );
    const fyi = await askedInLookout(
      call,
      { question: 'Skip discovery?', about: { kind: 'skip-discovery' }, framing: true, urgency: 'fyi' },
      /skip discovery/,
    );
    await expect(call('start_trail', { ...TRAIL, discovery: false, questionId: fyi })).rejects.toThrow(/fyi/);
    const plain = await askedInLookout(call, { question: 'Who is it for?', framing: true }, /^$/, 'Clients');
    await expect(call('start_trail', { ...TRAIL, discovery: false, questionId: plain })).rejects.toThrow(
      /was not asked about this/,
    );
    // With discovery, nothing to ask.
    await expect(call('start_trail', TRAIL)).resolves.toBeTruthy();
  });
});

describe('the trail’s mode and destination', () => {
  async function trail(call: Call) {
    await call('start_trail', { ...TRAIL, mode: 'plan-only' });
  }

  it('a new mode needs the answer about that mode; the same mode needs nothing', async () => {
    const call = await connect();
    await trail(call);
    await expect(call('update_trail', { mode: 'plan+execute' })).rejects.toThrow(
      /To switch the trail to plan\+execute is the human's call/,
    );
    await expect(call('update_trail', { mode: 'plan-only', notes: 'n' })).resolves.toBeTruthy();
    const other = await askedInLookout(
      call,
      { question: 'Plan only?', about: { kind: 'mode', mode: 'plan-only' } },
      /switch the trail to plan-only/,
    );
    await expect(call('update_trail', { mode: 'plan+execute', questionId: other })).rejects.toThrow(
      /was not asked about this/,
    );
    const q = await askedInLookout(
      call,
      { question: 'Start building?', about: { kind: 'mode', mode: 'plan+execute' } },
      /switch the trail to plan\+execute/,
    );
    const done = await call<{ mode: string }>('update_trail', { mode: 'plan+execute' });
    expect(done.mode).toBe('plan+execute');
    expect((await decisions()).map((d) => d.question)).toContain('Start building?');
    expect(q).toBeTruthy();
  });

  it('a new destination needs the answer about that exact text, or a reroute', async () => {
    const call = await connect();
    await trail(call);
    await expect(call('update_trail', { destination: 'Clients export and import' })).rejects.toThrow(
      /set the destination to “Clients export and import” is the human's call.*propose_reroute/s,
    );
    const q = await askedInLookout(
      call,
      { question: 'Widen it to imports?', about: { kind: 'destination', destination: 'Clients export and import' } },
      /set the destination/,
    );
    await expect(call('update_trail', { destination: 'Clients import', questionId: q })).rejects.toThrow(
      /was not asked about this/,
    );
    await call('update_trail', { destination: 'Clients export and import', questionId: q });
    expect((await decisions()).at(-1)).toMatchObject({ decidedBy: 'trail lead', question: 'Widen it to imports?' });
  });

  it('an answer about a setting backs nothing else, such as closing a junction', async () => {
    const call = await connect();
    const m = await call<{ tickets: { key: string; title: string }[] }>('start_trail', {
      ...TRAIL,
      tickets: [{ ref: 'j', title: 'CSV or JSON?', type: 'junction' }],
    });
    await call('claim_ticket', { ticket: m.tickets.find((t) => t.title === 'CSV or JSON?')!.key });
    const q = await askedInLookout(
      call,
      { question: 'Plan only?', about: { kind: 'mode', mode: 'plan-only' } },
      /switch the trail to plan-only/,
    );
    await expect(call('close_ticket', { resolution: 'CSV', questionId: q })).rejects.toThrow(/backs nothing else/);
  });

  it('a question on a junction says what answering it decides; an fyi says nothing', async () => {
    const call = await connect();
    const m = await call<{ tickets: { key: string; title: string }[] }>('start_trail', {
      ...TRAIL,
      tickets: [{ ref: 'j', title: 'CSV or JSON?', type: 'junction' }],
    });
    const key = m.tickets.find((t) => t.title === 'CSV or JSON?')!.key;
    await call('claim_ticket', { ticket: key });
    await call('ask_human', { question: 'CSV or JSON?', waitSeconds: 0 });
    await call('ask_human', { question: 'Lunch?', urgency: 'fyi', waitSeconds: 0 });
    const pending = (await readAgentDocs(root)).flatMap((d) => d.pending);
    expect(pending.map((p) => p.stakes)).toEqual([`Answering this decides ${key}`, undefined]);
  });
});
