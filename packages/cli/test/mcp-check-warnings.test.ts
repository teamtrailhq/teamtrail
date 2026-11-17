import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { chooseMain } from '@teamtrail/core/agents';
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

/** A check whose script isn't in package.json, and one whose script is. */
function writeConfig() {
  fs.writeFileSync(path.join(top, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .' } }));
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      checks: { lint: { run: ['npm', 'run', 'lint'] }, test: { run: ['npm', 'test'] } },
      run: ['lint', 'test'],
    }),
  );
  approveAllHere(root);
}

beforeEach(() => {
  top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-screen-')), 'app');
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

describe('check screening over MCP', () => {
  it('tells the claiming agent which of its checks cannot run as the repo is', async () => {
    writeConfig();
    const call = await connect();
    const m = await call<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
      discovery: false,
      title: 'Search',
      destination: 'Readers find a release',
      tickets: [{ ref: 'ui', title: 'Search box', type: 'execute' }],
    });
    // the checks fail on main too (no eslint, no test script): once they ran there, the trail lead starts anyway
    await call('next_ticket');
    chooseMain({ root, mapId: m.trail.id, choice: { kind: 'proceed' } });
    const c = await call<{ checkWarnings?: string[] }>('claim_ticket', { ticket: m.tickets[0].key });
    expect(c.checkWarnings).toEqual([
      "test: No `test` script in package.json. If it can't pass, tell the human; only they can change or waive checks.",
    ]);
  });
});
