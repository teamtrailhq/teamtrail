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

let top: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

async function connect(agentName: string) {
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

beforeEach(() => {
  top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-parallel-')), 'app');
  root = path.join(top, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  sh(top, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(top, 'readme.md'), 'hi\n');
  sh(top, 'add', '-A');
  sh(top, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'workspaces.json'), JSON.stringify({ v: 1, worktrees: true }));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(top), { recursive: true, force: true });
});

type Claimed = {
  claimed: { key: string };
  workspace?: { path: string; branch: string; base: string };
  warnings?: { ticket: string; agent: string; message: string }[];
};

describe('parallel work over MCP', () => {
  it('gives each claim its own worktree, warns on overlapping files, and reports the branch on completion', async () => {
    const one = await connect('claude-01');
    const two = await connect('codex-01');
    await one('start_trail', {
      discovery: false,
      title: 'Search',
      destination: 'Readers find a release',
      tickets: [
        { ref: 'ui', title: 'Search box', type: 'task' },
        { ref: 'api', title: 'Search endpoint', type: 'task' },
      ],
    });
    const a = await one<Claimed>('claim_ticket', { touches: ['src/search/**'] });
    const b = await two<Claimed>('claim_ticket', { touches: ['src/search/index.ts'] });
    expect(a.warnings).toBeUndefined();
    expect(b.warnings?.[0]).toMatchObject({ ticket: a.claimed.key, agent: 'claude-01' });
    expect(b.warnings?.[0].message).toMatch(/src\/search\/index\.ts and src\/search\/\*\*/);
    for (const c of [a, b]) {
      expect(c.workspace?.branch).toMatch(/^teamtrail\/search\/\d+$/);
      expect(sh(c.workspace?.path ?? '', 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(c.workspace?.branch);
    }
    const status = await one<{ parallel: { workspaces: unknown[]; declared: string[] } }>('status');
    expect(status.parallel.workspaces).toHaveLength(2);
    expect(status.parallel.declared).toHaveLength(1);

    const done = await one<{ closed: string; workspace: { branch: string; review: string } }>('close_ticket', {
      resolution: 'Search box added',
      noCodeReason: 'test',
    });
    expect(done.workspace.branch).toBe(a.workspace?.branch);
    expect(done.workspace.review).toMatch(/never merges/);
  });

  it('claims without a workspace, and says why, outside a git repository', async () => {
    fs.rmSync(path.join(top, '.git'), { recursive: true, force: true });
    const one = await connect('claude-01');
    await one('start_trail', {
      discovery: false,
      title: 'Docs',
      destination: 'Docs are clear',
      tickets: [{ ref: 'a', title: 'Fix typos', type: 'task' }],
    });
    const c = await one<Claimed & { workspaceNote: string }>('claim_ticket', { touches: ['docs/**'] });
    expect(c.claimed.key).toBeTruthy();
    expect(c.workspace).toBeUndefined();
    expect(c.workspaceNote).toMatch(/not a git repository/);
  });
});
