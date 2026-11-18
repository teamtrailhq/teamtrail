import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter } from '@teamtrail/core';
import { journalFile, lookoutOnlyTickets, readAttempts } from '@teamtrail/core/agents';
import { nodeMarkdownFs, undoRuleWaiver, waiveRule } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

let top: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const PASS = [process.execPath, '-e', 'process.exit(0)'];
const ASK = 'Does a new field load from older transcripts that lack it?';

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

/** A `test` check on every completion, a `session` check only rules run, and one rule that runs it and asks. */
function writeConfig(gate?: 'observe') {
  const rules = [{ id: 'R-1', when: ['src/session/**'], check: 'session', ask: ASK, why: 'D-12: old sessions failed' }];
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      checks: { test: { run: PASS }, session: { run: PASS } },
      run: ['test'],
      rules,
      ...(gate ? { gates: { 'diff-rules': gate } } : {}),
    }),
  );
  approveAllHere(root);
}

const write = (rel: string) => {
  fs.mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
  fs.writeFileSync(path.join(top, rel), 'x\n');
};

beforeEach(() => {
  top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-rules-')), 'app');
  root = path.join(top, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  sh(top, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(top, 'readme.md'), 'hi\n');
  sh(top, 'add', '-A');
  sh(top, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(top), { recursive: true, force: true });
});

async function claimSession(call: Awaited<ReturnType<typeof connect>>) {
  const m = await call<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
    discovery: false,
    title: 'Sessions',
    destination: 'Sessions keep a new field',
    tickets: [{ ref: 's', title: 'Add a field', type: 'execute' }],
  });
  const c = await call<{ claimed: { id: string }; rules?: { id: string; touches: string[] }[] }>('claim_ticket', {
    ticket: m.tickets[0].key,
    touches: ['src/session/store.ts'],
  });
  return { mapId: m.trail.id, key: m.tickets[0].key, id: c.claimed.id, rules: c.rules };
}

describe('diff rules over MCP', () => {
  it('tells the claim, refuses a completion without the answer, and runs the rule check with one', async () => {
    writeConfig();
    const call = await connect();
    const { mapId, key, id, rules } = await claimSession(call);
    expect(rules).toEqual([expect.objectContaining({ id: 'R-1', touches: ['src/session/store.ts'] })]);
    write('src/session/store.ts');

    await expect(call('close_ticket', { resolution: 'Added the field' })).rejects.toThrow(/R-1 asks: Does a new field/);
    expect(readAttempts(root, mapId, id)).toEqual([]);
    expect(journalFile(root).readGates(mapId)).toEqual([
      expect.objectContaining({ gate: 'diff-rules', mode: 'enforce', ticketKey: key }),
    ]);

    const answer = 'Yes: the loader defaults it, covered by a test on an old transcript.';
    const done = await call<{ closed?: string }>('close_ticket', {
      resolution: 'Added the field',
      ruleAnswers: [{ rule: 'R-1', answer }],
    });
    expect(done.closed).toBe(key);
    const attempt = readAttempts(root, mapId, id).at(-1)!;
    expect(attempt.checks.map((c) => c.name)).toEqual(['test', 'session']);
    expect(attempt.rules).toEqual([
      {
        id: 'R-1',
        why: 'D-12: old sessions failed',
        files: ['src/session/store.ts'],
        check: 'session',
        ask: ASK,
        answer,
      },
    ]);
    const proof = await call<{ markdown: string; status: string }>('proof_report', { ticket: key });
    expect(proof.markdown).toContain('**Diff rules:**');
    expect(proof.markdown).toContain('answered by the agent (claimed, not verified)');
    expect(proof.status).toBe('verified');
  });

  it('lets a change that matches no rule through, and asks nothing', async () => {
    writeConfig();
    const call = await connect();
    const { key, mapId, id } = await claimSession(call);
    write('src/other.ts');
    const done = await call<{ closed?: string }>('close_ticket', { resolution: 'Elsewhere' });
    expect(done.closed).toBe(key);
    expect(readAttempts(root, mapId, id).at(-1)!.rules).toBeUndefined();
  });

  it('observes without holding, and the proof says the question went unanswered', async () => {
    writeConfig('observe');
    const call = await connect();
    const { key, mapId } = await claimSession(call);
    write('src/session/store.ts');
    const done = await call<{ closed?: string }>('close_ticket', { resolution: 'Added the field' });
    expect(done.closed).toBe(key);
    expect(journalFile(root).readGates(mapId).at(-1)).toMatchObject({ mode: 'observe' });
    const proof = await call<{ status: string; gaps: string[] }>('proof_report', { ticket: key });
    expect(proof.status).toBe('not-verified');
    expect(proof.gaps).toContain(`R-1's question went unanswered: ${ASK}`);
  });

  it('goes through once the trail lead lets the ticket go without the rule, and the proof says who', async () => {
    writeConfig();
    const call = await connect();
    const { key, mapId, id } = await claimSession(call);
    write('src/session/store.ts');
    await expect(call('close_ticket', { resolution: 'Added the field' })).rejects.toThrow(/R-1/);
    const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
    const ask = { mapId, ticketId: id, rule: 'R-1', reason: 'no transcripts exist yet', local: true };
    await expect(waiveRule({ adapter, root }, { ...ask, via: 'slack' })).rejects.toThrow(/Lookout/);
    await waiveRule({ adapter, root }, { ...ask, via: 'lookout', person: 'Ada' });
    expect(journalFile(root).readRuleWaivers(mapId)).toEqual([expect.objectContaining({ rule: 'R-1', actor: 'Ada' })]);

    const done = await call<{ closed?: string }>('close_ticket', { resolution: 'Added the field' });
    expect(done.closed).toBe(key);
    const proof = await call<{ gaps: string[] }>('proof_report', { ticket: key });
    expect(proof.gaps).toContain("R-1's question wasn't answered: Ada let the work go without it.");
  });

  it('asks again once the trail lead undoes Go without, with the same refusals as the waiver', async () => {
    writeConfig();
    const call = await connect();
    const { key, mapId, id } = await claimSession(call);
    write('src/session/store.ts');
    const env = { adapter: new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root), root };
    const ids = { mapId, ticketId: id, rule: 'R-1', local: true };
    await expect(undoRuleWaiver(env, { ...ids, via: 'lookout' })).rejects.toThrow(`${key} isn't going without R-1.`);
    await waiveRule(env, { ...ids, reason: 'no transcripts exist yet', via: 'lookout', person: 'Ada' });
    await expect(undoRuleWaiver(env, { ...ids, via: 'slack' })).rejects.toThrow(/is for the Lookout/);
    await expect(undoRuleWaiver(env, { ...ids, via: 'chat' })).rejects.toThrow(/is for the Lookout/);
    await expect(undoRuleWaiver(env, { ...ids, via: 'lookout', person: 'Ada' })).resolves.toEqual({
      rule: 'R-1',
      waived: false,
    });
    expect(
      journalFile(root)
        .readRuleWaivers(mapId)
        .map((e) => [e.action, e.actor]),
    ).toEqual([
      ['waived', 'Ada'],
      ['undone', 'Ada'],
    ]);
    const t = (await env.adapter.loadMap(mapId)).tickets.find((x) => x.id === id)!;
    expect(t.comments.at(-1)!.body).toContain('**R-1 asks again**');
    // the next completion is held for the rule's answer again
    await expect(call('close_ticket', { resolution: 'Added the field' })).rejects.toThrow(/R-1 asks/);
  });

  it('on a high-risk ticket, Undo is for the Lookout on its machine and a caller allowed high-risk calls', async () => {
    writeConfig();
    const call = await connect();
    const { key, mapId, id } = await claimSession(call);
    const env = { adapter: new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root), root };
    const ids = { mapId, ticketId: id, rule: 'R-1' };
    await waiveRule(env, { ...ids, reason: 'no transcripts exist yet', via: 'lookout', local: true });
    lookoutOnlyTickets.mark(root, { mapId, ticketId: id, categories: ['auth-permissions'] });
    await expect(undoRuleWaiver(env, { ...ids, via: 'lookout-limited', local: true })).rejects.toThrow(key);
    await expect(undoRuleWaiver(env, { ...ids, via: 'lookout', local: false })).rejects.toThrow(
      `${key} is high risk: change its rules in the Lookout on its machine.`,
    );
    await expect(undoRuleWaiver(env, { ...ids, via: 'lookout', local: true })).resolves.toMatchObject({ rule: 'R-1' });
  });
});
