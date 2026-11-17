import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { chooseMain, latestMainRun, trustKey, trustLedger } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

let repo: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];
type Call = <T = Record<string, unknown>>(name: string, args?: Record<string, unknown>) => Promise<T>;

async function connect(agentName: string): Promise<Call> {
  const agent = new TrailAgent({ root, agent: agentName, pollMs: 20 });
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

/** A repo whose `test` check already fails on main. */
beforeEach(() => {
  repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-mcp-main-')), 'app');
  root = path.join(repo, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(repo, '.gitignore'), '.teamtrail\n');
  fs.writeFileSync(path.join(repo, 'check.js'), "console.log('FAIL App > should render title'); process.exit(1);");
  const checks = { test: { run: [process.execPath, 'check.js'] } };
  fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, checks, run: ['test'] }));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  approveAllHere(root);
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(repo), { recursive: true, force: true });
});

type Next = {
  ticket: { key: string; type: string } | null;
  reason?: string;
  mainChecks?: { waits?: string; knownFailures?: string[]; note?: string; lookoutItem?: string };
};

async function trail(call: Call) {
  const started = await call<{ trail: { id: string }; tickets: { ref: string; key: string }[] }>('start_trail', {
    discovery: false,
    title: 'Title',
    destination: 'The page shows its title',
    tickets: [
      { ref: 'r', title: 'Where is the title set?', type: 'research' },
      { ref: 't', title: 'Render the title', type: 'task' },
    ],
  });
  const mapId = started.trail.id;
  const skipped = { hash: 'test', at: Date.now(), by: 'trail lead', content: '' };
  trustLedger(root).set({ [trustKey.discoverySkipped(mapId)]: skipped });
  return { mapId, task: started.tickets.find((t) => t.ref === 't')!.key };
}

describe('checks on main over MCP', () => {
  it('holds implementation while main fails, says why, and lets it go once the trail lead starts anyway', async () => {
    const call = await connect('claude-01');
    const { mapId, task } = await trail(call);

    const next = await call<Next>('next_ticket');
    expect(next.ticket?.type).toBe('research');
    expect(next.mainChecks?.waits).toMatch(/Checks already fail on main \(test\)/);
    const impl = await call<Next>('next_ticket', { types: ['task'] });
    expect(impl.ticket).toBeNull();
    expect(impl.reason).toMatch(/fix main, drop the check for this trail or start anyway/);
    // only the trail lead's choice in the Lookout settles it: the agent sends the human to that item, never asks
    expect(impl.reason).toMatch(
      /Only the trail lead can choose .* the "test already fails on main" item in their queue/,
    );
    expect(impl.reason).toMatch(/Don't ask_human about it/);
    const run = latestMainRun(root)!;
    const item = encodeURIComponent(`main-checks:${mapId}:${run.id}`);
    expect(next.mainChecks?.lookoutItem).toBe(`?item=${item}`);
    expect(impl.reason).toContain(`?item=${item}`);
    await expect(call('claim_ticket', { ticket: task })).rejects.toThrow(/already fail on main.*Tell the human/);

    chooseMain({ root, mapId, choice: { kind: 'proceed' } });
    const after = await call<Next>('next_ticket', { types: ['task'] });
    expect(after.ticket?.key).toBe(task);
    expect(after.mainChecks?.waits).toBeUndefined();
    expect(after.mainChecks?.knownFailures).toEqual(['test']);
    expect(after.mainChecks?.note).toMatch(/don't chase these/);
    const claimed = await call<{ mainChecks?: { knownFailures?: string[] } }>('claim_ticket', { ticket: task });
    expect(claimed.mainChecks?.knownFailures).toEqual(['test']);
  });
});
