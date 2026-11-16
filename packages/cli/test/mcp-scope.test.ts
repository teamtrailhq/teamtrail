import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readAttempts } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

let top: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

async function connect(agentName = 'claude-01') {
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

/** Checks that always pass, and what a change outside the declared files does. */
function writeConfig(scope?: 'flag' | 'fail' | 'human') {
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      checks: { check: { run: [process.execPath, '-e', 'process.exit(0)'] } },
      run: ['check'],
      ...(scope ? { scope } : {}),
    }),
  );
  approveAllHere(root);
}

const write = (rel: string) => {
  fs.mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
  fs.writeFileSync(path.join(top, rel), 'x\n');
};

beforeEach(() => {
  top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-scope-')), 'app');
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

async function claimSearch(call: Awaited<ReturnType<typeof connect>>) {
  const m = await call<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
    discovery: false,
    title: 'Search',
    destination: 'Readers find a release',
    tickets: [{ ref: 'ui', title: 'Search box', type: 'execute' }],
  });
  const c = await call<{ claimed: { id: string } }>('claim_ticket', {
    ticket: m.tickets[0].key,
    touches: ['src/search/**'],
  });
  return { mapId: m.trail.id, key: m.tickets[0].key, id: c.claimed.id };
}

describe('the scope check over MCP', () => {
  it('shows the reviewer what changed outside the files declared at the claim', async () => {
    writeConfig();
    const call = await connect();
    const { mapId, key, id } = await claimSearch(call);
    write('src/search/box.ts');
    write('src/billing/tax.ts');
    const done = await call<{ closed?: string; status?: string }>('close_ticket', { resolution: 'Search box' });
    expect(done).toMatchObject({ closed: key, status: 'done' });

    const attempt = readAttempts(root, mapId, id).at(-1)!;
    expect(attempt.touches).toEqual(['src/search/**']);
    expect(attempt.git?.flags.find((f) => f.kind === 'outside-scope')).toMatchObject({
      level: 'warn',
      files: ['src/billing/tax.ts'],
    });
    const proof = await call<{ markdown: string }>('proof_report', { ticket: key });
    expect(proof.markdown).toContain(
      '**Scope:** 1 changed file outside the declared src/search/\\*\\*: src/billing/tax.ts.',
    );
  });

  it('sends the work back when the project says so, and passes once it keeps to its files', async () => {
    writeConfig('fail');
    const call = await connect();
    const { key } = await claimSearch(call);
    write('src/search/box.ts');
    write('src/billing/tax.ts');
    const back = await call<{ status?: string; note?: string }>('close_ticket', { resolution: 'Search box' });
    expect(back.status).toBe('rework');

    fs.rmSync(path.join(top, 'src/billing'), { recursive: true });
    await call('claim_ticket', { ticket: key });
    const done = await call<{ closed?: string }>('close_ticket', { resolution: 'Search box, nothing else' });
    expect(done.closed).toBe(key);
  });
});
