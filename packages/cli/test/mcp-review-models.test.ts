import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { journalFile, readAttempts } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

const OPUS = 'claude-opus-5-5';
const CODEX = 'gpt-5.1-codex';
let root: string;
const open: { close(): void | Promise<void> }[] = [];
type Call = <T = Record<string, unknown>>(name: string, args?: Record<string, unknown>) => Promise<T>;

/** An agent whose log says it runs on `model`. */
async function connect(agentName: string, model: string): Promise<Call> {
  const usage = { noteCall: () => undefined, measure: () => undefined, model: () => model };
  const agent = new TrailAgent({ root, agent: agentName, pollMs: 20, usage });
  const server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return async (name, args = {}) => {
    const r = (await callTool(client, root, name, args)) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text);
  };
}

function writeConfig(gate: 'observe' | 'enforce') {
  const checks = { ok: { run: [process.execPath, '-e', 'process.exit(0)'] } };
  const config = { v: 1, checks, run: ['ok'], default: 'checks+review', gates: { 'independent-review': gate } };
  fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(config));
  approveAllHere(root);
}

type Next = { ticket: { key: string; type: string } | null; reason?: string };

/** claude-01 on claude-opus-5-5 builds #2; its checks pass, so a review ticket opens. */
async function builtOnOpus() {
  const worker = await connect('claude-01', OPUS);
  const started = await worker<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
    discovery: false,
    title: 'Changelog',
    destination: 'A changelog page',
    tickets: [
      { ref: 'notes', title: 'Where do notes live?', type: 'research' },
      { ref: 'build', title: 'Build the page', type: 'execute' },
    ],
  });
  const build = started.tickets[1].key;
  await worker('claim_ticket', { ticket: build });
  await worker('report_completion', { resolution: 'Built the page' });
  return { mapId: started.trail.id, build, research: started.tickets[0].key };
}

beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-review-models-')), '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

describe('independent review across models over MCP', () => {
  it('observe: another model is offered the review first; the same model gets it last, with a note', async () => {
    writeConfig('observe');
    const { mapId, build } = await builtOnOpus();
    expect(readAttempts(root, mapId, build.replace('#', ''))[0].model).toBe(OPUS);
    const sonnet = await connect('claude-02', OPUS);
    const codex = await connect('codex-01', CODEX);
    expect((await sonnet<Next>('next_ticket')).ticket?.type).toBe('research');
    const review = (await codex<Next>('next_ticket')).ticket!;
    expect(review.type).toBe('review');
    const claimed = await sonnet<{ reviewModel?: string }>('claim_ticket', { ticket: review.key });
    expect(claimed.reviewModel).toMatch(`You run ${OPUS}, the model that did ${build}: your review is recorded`);
    const done = await sonnet<{ phase: string }>('submit_review', { verdict: 'PASS', summary: 'Renders the notes' });
    expect(done.phase).toBe('done');
    expect(
      journalFile(root)
        .readGates(mapId)
        .map((g) => g.mode),
    ).toEqual(['observe']);
  });

  it('enforce: while an agent on another model is connected, the same model may not take the review', async () => {
    writeConfig('enforce');
    const { build } = await builtOnOpus();
    const codex = await connect('codex-01', CODEX);
    await codex('resume_trail');
    const opus = await connect('claude-02', OPUS);
    const next = await opus<Next>('next_ticket');
    expect(next.ticket?.type).toBe('research');
    const review = (await codex<Next>('next_ticket')).ticket!;
    await expect(opus('claim_ticket', { ticket: review.key })).rejects.toThrow(
      `waits for an agent on another model than ${OPUS}, the model that did ${build}`,
    );
    const r = await codex<{ phase: string }>('claim_ticket', { ticket: review.key });
    expect(r).toBeTruthy();
    expect((await codex<{ phase: string }>('submit_review', { verdict: 'PASS', summary: 'Fine' })).phase).toBe('done');
  });

  it('enforce: alone, the same model reviews, but its PASS waits for another model or the human', async () => {
    writeConfig('enforce');
    const { build, research } = await builtOnOpus();
    const opus = await connect('claude-02', OPUS);
    await opus('claim_ticket', { ticket: research });
    await opus('close_ticket', { resolution: 'Notes live in docs/' });
    const review = (await opus<Next>('next_ticket')).ticket!;
    expect(review.type).toBe('review');
    const claimed = await opus<{ reviewModel?: string }>('claim_ticket', { ticket: review.key });
    expect(claimed.reviewModel).toMatch(/a PASS from you won't count until an agent on another model reviews it/);
    const done = await opus<{ phase: string; next: string }>('submit_review', { verdict: 'PASS', summary: 'Fine' });
    expect(done.phase).toBe('verifying');
    expect(done.next).toMatch(new RegExp(`the model that did ${build}, so your PASS doesn't count yet`));
    const again = await opus<Next>('next_ticket');
    expect(again.ticket).toBeNull();
    expect(again.reason).toMatch(/waits for an agent on another model than claude-opus-5-5/);
  });
});
