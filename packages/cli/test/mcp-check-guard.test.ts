import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter } from '@teamtrail/core';
import { journalFile, operatorAction, readAttempts } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

let top: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const TESTS =
  "it('adds', () => {\n  expect(1 + 1).toBe(2);\n});\nit('subtracts', () => {\n  expect(1 - 1).toBe(0);\n});\n";

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

/** A check that runs a script in the repo and always passes, and the gate's mode. */
function writeConfig(mode?: 'off' | 'observe' | 'enforce') {
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      checks: { test: { run: [process.execPath, 'scripts/check.mjs'] } },
      run: ['test'],
      ...(mode ? { gates: { 'check-guard': mode } } : {}),
    }),
  );
  approveAllHere(root);
}

const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
  fs.writeFileSync(path.join(top, rel), text);
};

beforeEach(() => {
  top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-guard-')), 'app');
  root = path.join(top, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  sh(top, 'init', '-q', '-b', 'main');
  write('scripts/check.mjs', 'process.exit(0);\n');
  write('src/math.test.ts', TESTS);
  write('src/math.ts', 'export const add = (a, b) => a + b;\n');
  sh(top, 'add', '-A');
  sh(top, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(top), { recursive: true, force: true });
});

async function claimMath(call: Awaited<ReturnType<typeof connect>>) {
  const m = await call<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
    discovery: false,
    title: 'Math',
    destination: 'Maths work',
    tickets: [{ ref: 'add', title: 'Faster add', type: 'execute' }],
  });
  const c = await call<{ claimed: { id: string } }>('claim_ticket', { ticket: m.tickets[0].key });
  return { mapId: m.trail.id, key: m.tickets[0].key, id: c.claimed.id };
}

type Closed = {
  closed?: string;
  status?: string;
  note?: string;
  checkGuard?: { held: boolean; findings: { file: string; what: string }[] };
};

const env = () => ({
  adapter: new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root),
  root,
  journal: journalFile(root),
});

describe('the check guard over MCP', () => {
  it('holds a pass when the work changed the script its check runs, until the trail lead accepts it', async () => {
    writeConfig();
    const call = await connect();
    const { mapId, key, id } = await claimMath(call);
    write('src/math.ts', 'export const add = (a, b) => b + a;\n');
    write('scripts/check.mjs', '// nothing to check\nprocess.exit(0);\n');
    const held = await call<Closed>('close_ticket', { resolution: 'Faster add' });
    expect(held.status).toBe('blocked');
    expect(held.checkGuard).toMatchObject({
      held: true,
      findings: [{ file: 'scripts/check.mjs', what: 'scripts/check.mjs changed (the check runs it)' }],
    });
    expect(held.note).toContain('changed what they run');

    const attempt = readAttempts(root, mapId, id).at(-1)!;
    expect(attempt.result).toBe('pass');
    expect(attempt.guard?.mode).toBe('enforce');
    expect(journalFile(root).readGates(mapId)).toMatchObject([
      { gate: 'check-guard', mode: 'enforce', ticketKey: key, reason: 'scripts/check.mjs changed (the check runs it)' },
    ]);
    const before = await call<{ status: string; gaps: string[] }>('proof_report', { ticket: key });
    expect(before.status).toBe('not-verified');
    expect(before.gaps).toContain(
      'The work changed what its checks run: scripts/check.mjs changed (the check runs it).',
    );

    await operatorAction(env(), {
      action: 'accept',
      mapId,
      ticketId: id,
      by: 'trail lead',
      reason: 'needed the comment',
    });
    const after = await call<{ status: string; markdown: string }>('proof_report', { ticket: key });
    expect(after.status).toBe('verified');
    expect(after.markdown).toContain('**Changed what its checks run** (accepted by trail lead: needed the comment):');
  });

  it('holds a pass that skipped a test, and the trail lead can send it back', async () => {
    writeConfig();
    const call = await connect();
    const { mapId, key, id } = await claimMath(call);
    write('src/math.test.ts', TESTS.replace("it('subtracts'", "it.skip('subtracts'"));
    const held = await call<Closed>('close_ticket', { resolution: 'Faster add' });
    expect(held.status).toBe('blocked');
    expect(held.checkGuard?.findings.map((f) => f.what)).toEqual(['1 test skipped in src/math.test.ts']);
    await operatorAction(env(), { action: 'rework', mapId, ticketId: id, by: 'trail lead', reason: 'run the test' });
    const again = await call<{ claimed: { checkGuard?: { findings: { what: string }[] } } }>('claim_ticket', {
      ticket: key,
    });
    expect(again.claimed.checkGuard?.findings.map((f) => f.what)).toEqual(['1 test skipped in src/math.test.ts']);
  });

  it('lets new tests and edited test bodies through', async () => {
    writeConfig();
    const call = await connect();
    await claimMath(call);
    write(
      'src/math.test.ts',
      `${TESTS.replace('1 + 1', '2 + 2').replace('toBe(2)', 'toBe(4)')}it('adds zero', () => {});\n`,
    );
    const done = await call<Closed>('close_ticket', { resolution: 'Faster add, with a test' });
    expect(done.status).toBe('done');
    expect(done.checkGuard).toBeUndefined();
  });

  it('observe: the pass counts, the reviewer and the agent see what it would have held, and it is journaled', async () => {
    writeConfig('observe');
    const call = await connect();
    const { mapId, key } = await claimMath(call);
    write('scripts/check.mjs', 'process.exit(0); // ok\n');
    const done = await call<Closed & { git?: { flags: { kind: string }[] } }>('close_ticket', {
      resolution: 'Faster add',
    });
    expect(done.status).toBe('done');
    expect(done.checkGuard?.held).toBe(false);
    expect(done.git?.flags.map((f) => f.kind)).toContain('check-guard');
    expect(journalFile(root).readGates(mapId)).toMatchObject([{ gate: 'check-guard', mode: 'observe' }]);
    const proof = await call<{ status: string; markdown: string }>('proof_report', { ticket: key });
    expect(proof.status).toBe('verified');
    expect(proof.markdown).toContain('**Changed what its checks run** (observed, not held):');
  });

  it('off: reads nothing and records nothing', async () => {
    writeConfig('off');
    const call = await connect();
    const { mapId, id } = await claimMath(call);
    write('scripts/check.mjs', 'process.exit(0); // ok\n');
    const done = await call<Closed>('close_ticket', { resolution: 'Faster add' });
    expect(done.status).toBe('done');
    expect(readAttempts(root, mapId, id).at(-1)?.guard).toBeUndefined();
    expect(journalFile(root).readGates(mapId)).toEqual([]);
  });
});
