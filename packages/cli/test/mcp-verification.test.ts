import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter, type TransitionEntry } from '@teamtrail/core';
import { journalFile, readAttempts, RUNS_DIR } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
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
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}
type Call = Awaited<ReturnType<typeof connect>>;

/** `verification.json` whose `check` passes once `fixed.txt` exists in the repo. */
function writeConfig(
  extra: Record<string, unknown> = {},
  code = "process.exit(require('fs').existsSync('fixed.txt') ? 0 : 1)",
) {
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      checks: { check: { run: [process.execPath, '-e', `console.error('fixed.txt is missing'); ${code}`] } },
      run: ['check'],
      ...extra,
    }),
  );
  approveAllHere(root);
}

async function trail(call: Call) {
  return call<{ trail: { id: string; verification?: string }; tickets: { ref: string; key: string }[] }>(
    'start_trail',
    {
      discovery: false,
      title: 'Changelog',
      destination: 'A changelog page',
      tickets: [
        { ref: 'notes', title: 'Where do notes live?', type: 'research' },
        { ref: 'build', title: 'Build the page', type: 'execute' },
        { ref: 'ship', title: 'Ship it', type: 'execute', blockedBy: ['build'] },
      ],
    },
  );
}

type Done = {
  status?: string;
  closed?: string;
  attempt?: string;
  pending?: boolean;
  feedback?: { check: string; exitCode: number; tail: string }[];
  attemptsLeft?: number;
  unblocked?: { key: string }[];
  decision?: { id: string } | null;
  note?: string;
};

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-verify-'));
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root);
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('verified completion over MCP', () => {
  it('without verification.json, trails are off and close_ticket closes as before', async () => {
    const call = await connect();
    const m = await trail(call);
    expect(m.trail.verification).toBeUndefined();
    const claimed = await call<{ claimed: Record<string, unknown> }>('claim_ticket', { ticket: m.tickets[1].key });
    expect(claimed.claimed.verification).toBeUndefined();
    const r = await call<Done>('close_ticket', { resolution: 'Built it' });
    expect(Object.keys(r).sort()).toEqual(['closed', 'decision', 'next', 'outcome', 'trailDone', 'unblocked']);
    expect(r.closed).toBe(m.tickets[1].key);
  });

  it('fail → rework with feedback → fix → pass → done, journaled, rework first in the queue', async () => {
    writeConfig();
    const call = await connect();
    const m = await trail(call);
    expect(m.trail.verification).toBe('checks');
    const build = m.tickets[1].key;
    const claimed = await call<{ claimed: { verification: { level: string; checks: { name: string }[] } } }>(
      'claim_ticket',
      { ticket: build },
    );
    expect(claimed.claimed.verification).toMatchObject({ level: 'checks', checks: [{ name: 'check' }] });

    const failed = await call<Done>('close_ticket', { resolution: 'Built the page' });
    expect(failed).toMatchObject({ ticket: build, status: 'rework', attempt: 'A-1', attemptsLeft: 2 });
    expect(failed.closed).toBeUndefined();
    expect(failed.feedback?.[0]).toMatchObject({ check: 'check', exitCode: 1 });
    expect(failed.feedback?.[0].tail).toContain('fixed.txt is missing');

    const next = await call<{ ticket: { key: string; phase: string; rework: { attempt: string } } }>('next_ticket');
    expect(next.ticket).toMatchObject({ key: build, phase: 'rework', rework: { attempt: 'A-1' } });

    fs.writeFileSync(path.join(repo, 'fixed.txt'), 'ok');
    await call('claim_ticket', { ticket: build });
    const passed = await call<Done>('close_ticket', { resolution: 'Built the page, with the file' });
    expect(passed).toMatchObject({ closed: build, status: 'done', attempt: 'A-2' });
    expect(passed.decision).toBeTruthy();
    expect(passed.unblocked?.map((t) => t.key)).toEqual([m.tickets[2].key]);

    const events = journalFile(root)
      .read(m.trail.id)
      .filter((e: TransitionEntry) => e.ticketKey === build)
      .map((e) => `${e.event}:${e.to}:${e.actorKind}`);
    expect(events).toEqual([
      'claim:working:agent',
      'submit:verifying:agent',
      'checks.fail:rework:engine',
      'claim:working:agent',
      'submit:verifying:agent',
      'checks.pass:done:engine',
    ]);
    const snap = await new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root).loadMap(m.trail.id);
    const comments = snap.tickets
      .find((t) => t.key === build)!
      .comments.map((c) => `${c.author}: ${c.body.split('\n')[0]}`);
    expect(comments).toContain('teamtrail: **Verification A-1 failed · back for rework**');
    expect(comments).toContain('teamtrail: **Verification A-2 passed · done**');
  });

  it('decision tickets on a verified trail close without checks', async () => {
    writeConfig();
    const call = await connect();
    const m = await trail(call);
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const r = await call<Done>('close_ticket', { resolution: 'In CHANGELOG.md' });
    expect(r.status).toBeUndefined();
    expect(r.closed).toBe(m.tickets[0].key);
  });

  it('after maxAttempts failures the ticket waits on a human', async () => {
    writeConfig({ maxAttempts: 1 });
    const call = await connect();
    const m = await trail(call);
    await call('claim_ticket', { ticket: m.tickets[1].key });
    const r = await call<Done>('close_ticket', { resolution: 'Built' });
    expect(r.status).toBe('blocked');
    expect(r.note).toMatch(/human decides/);
    await expect(call('claim_ticket', { ticket: m.tickets[1].key })).rejects.toThrow(/held, not on the frontier/);
    const s = await call<{ trail: { counts: { waitingOnHuman: number } } }>('status');
    expect(s.trail.counts.waitingOnHuman).toBe(1);
  });

  it('a broken verification.json blocks instead of passing', async () => {
    writeConfig();
    const call = await connect();
    const m = await trail(call);
    fs.writeFileSync(path.join(root, 'verification.json'), '{"v":1,"run":"npm test"}');
    approveAllHere(root);
    await call('claim_ticket', { ticket: m.tickets[1].key });
    const r = await call<Done>('close_ticket', { resolution: 'Built' });
    expect(r.status).toBe('blocked');
    expect(r.note).toMatch(/verification.json has errors/);
  });

  it('returns pending when the wait runs out; verification_status waits for the result', async () => {
    writeConfig({}, 'setTimeout(() => process.exit(0), 600)');
    const call = await connect();
    const m = await trail(call);
    await call('claim_ticket', { ticket: m.tickets[1].key });
    const r = await call<Done>('report_completion', { resolution: 'Built', waitSeconds: 0, pr: 42 });
    expect(r).toMatchObject({ status: 'verifying', pending: true, attempt: 'A-1' });
    await expect(call('close_ticket', { ticket: m.tickets[1].key, resolution: 'again' })).rejects.toThrow(
      /being verified/,
    );
    const done = await call<Done>('verification_status', { ticket: m.tickets[1].key, wait: true, waitSeconds: 10 });
    expect(done).toMatchObject({ status: 'done', attempt: 'A-1' });
    const st = await call<{ phase: string; attempts: { id: string; result: string }[] }>('verification_status', {
      ticket: m.tickets[1].key,
    });
    expect(st.phase).toBe('done');
    expect(st.attempts).toEqual([expect.objectContaining({ id: 'A-1', result: 'pass' })]);
    expect(readAttempts(root, m.trail.id, m.tickets[1].key.replace('#', ''))[0].pr).toBe(42);
  });

  it('checks+review: another agent reviews the work; the worker is never given its own review', async () => {
    fs.writeFileSync(path.join(repo, 'fixed.txt'), 'ok');
    writeConfig({ default: 'checks+review' });
    const worker = await connect('claude-01');
    const m = await trail(worker);
    await worker('claim_ticket', { ticket: m.tickets[1].key });
    const r = await worker<Done>('report_completion', { resolution: 'Built the page' });
    expect(r).toMatchObject({ status: 'verifying', note: expect.stringMatching(/another agent reviews/) });

    const reviewer = await connect('claude-02');
    type Next = { ticket: { key: string; type: string } | null };
    const offered = (await reviewer<Next>('next_ticket')).ticket!;
    expect(offered.type).toBe('review');
    expect((await worker<Next>('next_ticket')).ticket?.type).not.toBe('review');
    await expect(worker('claim_ticket', { ticket: offered.key })).rejects.toThrow(/claude-01 worked on/);

    await reviewer('claim_ticket', { ticket: offered.key });
    await expect(reviewer('close_ticket', { resolution: 'fine' })).rejects.toThrow(/submit_review/);
    const done = await reviewer('submit_review', { verdict: 'PASS', summary: 'The page renders the notes' });
    expect(done).toMatchObject({ review: offered.key, verdict: 'V-1', ticket: m.tickets[1].key, phase: 'done' });
  });

  it('a run whose process died is recorded as interrupted and run again', async () => {
    fs.writeFileSync(path.join(repo, 'fixed.txt'), 'ok');
    writeConfig();
    const call = await connect();
    const m = await trail(call);
    const t = m.tickets[1];
    const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
    const id = t.key.replace('#', '');
    await adapter.assign(m.trail.id, id, 'claude-09');
    await adapter.setMeta(m.trail.id, id, { status: 'verifying' });
    fs.mkdirSync(path.join(root, RUNS_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(root, RUNS_DIR, `${m.trail.id}--${id}.json`),
      JSON.stringify({
        v: 1,
        id: 'A-1',
        mapId: m.trail.id,
        ticketId: id,
        ticketKey: t.key,
        agent: 'claude-09',
        level: 'checks',
        configHash: 'x',
        submittedAt: 1,
        resolution: 'Built before the crash',
        pid: 2 ** 22 + 4242,
        startedAt: 1,
      }),
    );
    await call('next_ticket');
    const done = await call<Done>('verification_status', { ticket: t.key, wait: true, waitSeconds: 10 });
    expect(done).toMatchObject({ status: 'done', attempt: 'A-2' });
    expect(readAttempts(root, m.trail.id, id).map((a) => a.result)).toEqual(['interrupted', 'pass']);
  });
});
