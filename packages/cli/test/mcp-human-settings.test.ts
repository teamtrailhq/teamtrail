import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter } from '@teamtrail/core';
import {
  briefPath,
  journalPath,
  readAgentDocs,
  readBrief,
  readReroute,
  rejectReroute,
  requiresDiscovery,
  journalFile,
  writeAgentAnswer,
} from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { approveInLookout } from './fakes/callTool';

/*
 * Skipping discovery, the trail's mode and its destination are the trail lead's settings. An agent's call never
 * changes them: it becomes a request (what, by whom, why) they approve or decline in the Lookout or Slack, like a
 * rule-out. No answer to a question stands in for Approve, whatever its words. An approval is kept as their decision.
 */
let root: string;
const open: { close(): void | Promise<void> }[] = [];

/** A local agent, its calls made as they are: no test helper approves anything. */
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
type Started = {
  trail: { id: string };
  tickets: { key: string; title: string; type: string }[];
  skipDiscovery?: { request: string; note: string };
};
type Status = { reroute: { status: string; next: string } };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-settings-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

const TRAIL = {
  title: 'Exports',
  destination: 'Clients export their data',
  tickets: [{ ref: 'b', title: 'Build the export', type: 'execute' }],
};
const adapter = () => new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
const env = () => ({ root, adapter: adapter(), journal: journalFile(root) });
const decline = (mapId: string, id: string) =>
  rejectReroute(env(), { mapId, id, by: 'trail lead', note: 'Do the discovery, it is a big change.' });

/** The human answers whatever waits, in the Lookout. */
async function answerAll(text: string) {
  for (const d of await readAgentDocs(root))
    for (const q of d.pending)
      writeAgentAnswer(root, { sessionId: d.session.id, questionId: q.id, text, author: 'trail lead', via: 'lookout' });
}

async function skipRequested(call: Call) {
  const started = await call<Started>('start_trail', {
    ...TRAIL,
    discovery: false,
    skipReason: 'A one-file change',
  });
  return { started, id: started.skipDiscovery!.request, build: started.tickets.find((t) => t.type === 'execute')! };
}

describe('skipping discovery is a request the trail lead approves', () => {
  it('nothing changes until they approve; then the brief no longer gates, kept as their decision', async () => {
    const call = await connect();
    const { started, id, build } = await skipRequested(call);
    expect(started.skipDiscovery!.note).toMatch(/trail lead's call.*approve or decline in the Lookout or Slack/s);
    expect(readReroute(root, started.trail.id, id)).toMatchObject({
      lane: 'setting',
      status: 'pending',
      by: 'claude-01',
      reason: 'Skip discovery',
      evidence: 'A one-file change',
    });
    await expect(call('claim_ticket', { ticket: build.key })).rejects.toThrow(/accepted discovery brief/);

    await approveInLookout({ root, mapId: started.trail.id, id });
    expect(readBrief(root, started.trail.id)).toBeUndefined();
    const snap = await adapter().loadMap(started.trail.id);
    expect(snap.tickets.find((t) => t.title.startsWith('Discovery brief'))).toMatchObject({ state: 'closed' });
    await expect(call('claim_ticket', { ticket: build.key })).resolves.toBeTruthy();
    const rec = (await adapter().listDecisions(started.trail.id)).find((d) => d.question.includes('asks to'))!;
    expect(rec).toMatchObject({ decidedBy: 'trail lead', source: { kind: 'lookout' } });
    expect(rec.question).toMatch(/^claude-01 asks to skip discovery\. Why: Skip discovery/);
    const journal = fs.readFileSync(journalPath(root, started.trail.id), 'utf8');
    expect(journal).toMatch(/"action":"approved"/);
    const st = await call<Status>('reroute_status', { trail: started.trail.id, id });
    expect(st.reroute).toMatchObject({ status: 'approved' });
    expect(st.reroute.next).toMatch(/agreed to skip discovery/);
  });

  it('declined: nothing changes, and the agent is told plainly', async () => {
    const call = await connect();
    const { started, id, build } = await skipRequested(call);
    await decline(started.trail.id, id);
    await expect(call('claim_ticket', { ticket: build.key })).rejects.toThrow(/accepted discovery brief/);
    const st = await call<Status>('reroute_status', { trail: started.trail.id, id });
    expect(st.reroute.next).toMatch(
      /Declined: the trail lead said no to skip discovery \(Do the discovery, it is a big change\.\)\. Don't do it/,
    );
    expect((await adapter().listDecisions(started.trail.id)).filter((d) => d.decidedBy === 'trail lead')).toEqual([]);
  });

  it('no answer approves it, whatever it says: in the Lookout or in a chat', async () => {
    const call = await connect();
    const { started, build } = await skipRequested(call);
    const asked = call<{ questionId: string }>('ask_human', { question: 'Can I skip discovery?', waitSeconds: 30 });
    await new Promise((r) => setTimeout(r, 100));
    await answerAll('Yes, skip discovery, approved.');
    await asked;
    const chat = await call<{ questionId: string }>('ask_human', { question: 'Skip it?', waitSeconds: 0 });
    await call('answer_question', { questionId: chat.questionId, answer: 'Approve' });
    await expect(call('claim_ticket', { ticket: build.key })).rejects.toThrow(/accepted discovery brief/);
    expect(readBrief(root, started.trail.id)?.status).not.toBe('accepted');
  });

  it('asking again returns the same request; an approval of what was not shown is refused', async () => {
    const call = await connect();
    const { started, id } = await skipRequested(call);
    const again = await call<{ requests: { request: string }[] }>('update_trail', { mode: 'plan-only' });
    expect(again.requests[0].request).not.toBe(id);
    const again2 = await call<{ requests: { request: string }[] }>('update_trail', { mode: 'plan-only' });
    expect(again2.requests[0].request).toBe(again.requests[0].request);
    const { approveReroute } = await import('@teamtrail/core/agents');
    await expect(
      approveReroute(env(), { mapId: started.trail.id, id, by: 'trail lead', hash: 'not-what-was-shown' }),
    ).rejects.toThrow(/changed since you looked at it/);
  });
});

describe('the discovery gate is this machine’s fact, not the brief file’s', () => {
  for (const attack of ['deletes the brief file', 'puts a folder where the brief file was'] as const)
    it(`an agent that ${attack} still can't claim implementation, and criteria stay required`, async () => {
      const call = await connect();
      const s = await call<Started>('start_trail', TRAIL);
      const file = briefPath(root, s.trail.id);
      fs.rmSync(file);
      if (attack !== 'deletes the brief file') fs.mkdirSync(file);
      const build = s.tickets.find((t) => t.type === 'execute')!;
      await expect(call('claim_ticket', { ticket: build.key })).rejects.toThrow(
        /the brief file is missing; only the trail lead can skip discovery/,
      );
      expect(requiresDiscovery(root, s.trail.id)).toBe(true);
    });
});

describe('the trail’s mode and destination', () => {
  it('a new mode is a request: applied when approved, the same mode asks nothing', async () => {
    const call = await connect();
    const s = await call<Started>('start_trail', { ...TRAIL, mode: 'plan-only' });
    const same = await call<{ mode: string; requests?: unknown }>('update_trail', { mode: 'plan-only', notes: 'n' });
    expect(same.requests).toBeUndefined();
    const asked = await call<{ mode: string; requests: { request: string; note: string }[] }>('update_trail', {
      mode: 'plan+execute',
      reason: 'The decisions are made',
    });
    expect(asked.mode).toBe('plan-only');
    expect(asked.requests[0].note).toMatch(/switch the trail to plan\+execute is the trail lead's call/);
    await approveInLookout({ root, mapId: s.trail.id, id: asked.requests[0].request });
    expect((await adapter().loadMap(s.trail.id)).map.mode).toBe('plan+execute');
  });

  it('a new destination is a request: declined, the destination stays', async () => {
    const call = await connect();
    const s = await call<Started>('start_trail', TRAIL);
    const asked = await call<{ requests: { request: string }[] }>('update_trail', {
      destination: 'Clients export and import',
    });
    await decline(s.trail.id, asked.requests[0].request);
    expect((await adapter().loadMap(s.trail.id)).map.sections.destination).toBe('Clients export their data');
  });

  it('a question on a junction says what answering it decides; an fyi says nothing', async () => {
    const call = await connect();
    const m = await call<Started>('start_trail', {
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
