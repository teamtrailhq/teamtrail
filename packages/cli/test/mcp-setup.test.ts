import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

let top: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: top, encoding: 'utf8' }).trim();

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

const write = (rel: string, text: string) => fs.writeFileSync(path.join(top, rel), text);
type Trail = { trail: { id: string; verification?: string }; tickets: { key: string; title: string }[] };
type Added = { ticket: { key: string; setup?: boolean; blockedBy: { key: string }[] } };

beforeEach(() => {
  top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-setup-')), 'app');
  root = path.join(top, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  git('init', '-q', '-b', 'main');
  write('README.md', '# App\n');
  write('.gitignore', '.teamtrail/\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(top), { recursive: true, force: true });
});

const START = { discovery: false, title: 'App', destination: 'A tiny app' };

describe('a new repo over MCP', () => {
  it('charts the setup ticket first, which proposes the checks and is checked with them; the rest waits', async () => {
    const call = await connect();
    const m = await call<Trail & { nextReason?: string }>('start_trail', {
      ...START,
      tickets: [{ ref: 'f', title: 'First feature', type: 'task' }],
    });
    expect(m.trail.verification).toBe('checks');
    const feature = m.tickets.find((t) => t.title === 'First feature')!;

    const setup = await call<Added>('add_ticket', { title: 'Set up the project', type: 'task', setup: true });
    expect(setup.ticket.setup).toBe(true);
    await expect(call('add_ticket', { title: 'Again', type: 'task', setup: true })).rejects.toThrow(
      /already has its setup ticket/,
    );
    const next = await call<{ ticket?: { key: string } }>('next_ticket');
    expect(next.ticket?.key).toBe(setup.ticket.key);
    await expect(call('claim_ticket', { ticket: feature.key })).rejects.toThrow(/blocked|Repo not ready/);

    await call('claim_ticket', { ticket: setup.ticket.key });
    write('package.json', JSON.stringify({ name: 'app', private: true, scripts: { test: 'node test.js' } }));
    write('test.js', "console.log('ok');\n");
    await expect(call('close_ticket', { resolution: 'Skeleton and a test' })).rejects.toThrow(
      /proposes the checks[\s\S]*suggests: test: npm test/,
    );

    const checks = { v: 1, checks: { test: { run: ['npm', 'test'] } }, run: ['test'] };
    fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(checks));
    const waiting = await call<{ status?: string; note?: string }>('close_ticket', {
      resolution: 'Skeleton and a test',
    });
    expect(waiting.status).toBe('waiting-approval');
    expect(waiting.note).toMatch(/This is the setup ticket/);

    approveAllHere(root);
    const done = await call<{ closed?: string; status?: string }>('close_ticket', {
      resolution: 'Skeleton and a test',
      waitSeconds: 60,
    });
    expect(done, JSON.stringify(done)).toMatchObject({ closed: setup.ticket.key });
    const status = await call<{ latest: { result: string; checks: { name: string }[] } }>('verification_status', {
      ticket: setup.ticket.key,
    });
    expect(status.latest.result).toBe('pass');
    expect(status.latest.checks.map((c) => c.name)).toEqual(['test']);

    // the setup work lands on main: checks on main pass there, and the feature it held opens with checks in force
    git('add', '-A');
    git('commit', '-qm', 'Set up the project');
    const after = await call<{ ticket?: { key: string }; nextReason?: string }>('next_ticket', {
      wait: true,
      waitSeconds: 60,
    });
    expect(after.ticket?.key, after.nextReason).toBe(feature.key);
    const claimed = await call<{ claimed: { verification: { checks: { name: string }[] } } }>('claim_ticket', {
      ticket: feature.key,
    });
    expect(claimed.claimed.verification.checks.map((c) => c.name)).toEqual(['test']);
  }, 120_000);

  it('a repo with a project gets no setup ticket, and nothing new is marked later', async () => {
    write('package.json', JSON.stringify({ name: 'app', scripts: { test: 'node -e 0' } }));
    const call = await connect();
    const m = await call<Trail>('start_trail', { ...START, tickets: [{ ref: 'f', title: 'Feature', type: 'task' }] });
    expect(m.trail.verification).toBeUndefined();
    await expect(call('add_ticket', { title: 'Set up', type: 'task', setup: true })).rejects.toThrow(/Only a new repo/);
  });

  it('on a new repo, results say to chart the setup ticket first; research and junctions are never setup', async () => {
    const call = await connect();
    const m = await call<{ readiness?: { newRepo?: string } }>('start_trail', START);
    expect(m.readiness?.newRepo).toMatch(/Set up the project/);
    await expect(call('add_ticket', { title: 'Look', type: 'research', setup: true })).rejects.toThrow(
      /task or execute/,
    );
  });
});
