import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { writeJsonAtomic } from '@teamtrail/core/agents';
import { readProjects, registerProject } from '@teamtrail/core/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HELP } from '../src/args/help';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { runProjects } from '../src/projects';

let tmp: string;
let root: string;
let other: string;
const prevConfig = process.env.TEAMTRAIL_CONFIG_DIR;

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-mcp-projects-')));
  process.env.TEAMTRAIL_CONFIG_DIR = path.join(tmp, 'config');
  root = path.join(tmp, 'here', '.teamtrail');
  other = path.join(tmp, 'billing', '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  const now = Date.now();
  writeJsonAtomic(path.join(other, '.agents', 'sessions', 's1.json'), {
    v: 1,
    session: {
      id: 's1',
      agent: 'codex-02',
      mode: 'work',
      mapId: '',
      step: 1,
      total: 2,
      status: 'running',
      startedAt: now,
    },
    chats: [],
    pending: [{ id: 'q1', sessionId: 's1', mapId: '', agent: 'codex-02', text: 'Round up or down?', at: now }],
    answered: [],
    feed: [],
    pid: process.pid,
    updatedAt: now,
  });
});
afterAll(() => {
  if (prevConfig === undefined) delete process.env.TEAMTRAIL_CONFIG_DIR;
  else process.env.TEAMTRAIL_CONFIG_DIR = prevConfig;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('projects', () => {
  it('teamtrail projects add and list use the config dir, never the repo', () => {
    const lines: string[] = [];
    runProjects(['add', path.dirname(other)], '.teamtrail', (s) => lines.push(s));
    runProjects(['list'], '.teamtrail', (s) => lines.push(s));
    expect(lines.join('\n')).toMatch(/Added\s+billing/);
    expect(lines.join('\n')).toMatch(/billing\s+.*billing/);
    expect(readProjects(path.join(tmp, 'config')).projects.map((p) => p.root)).toEqual([other]);
    expect(fs.existsSync(path.join(other, 'projects.json'))).toBe(false);
  });

  it('help names the projects command and the opt-out', () => {
    expect(HELP).toMatch(/projects add \[path\] \| list \| remove <id\|path>/);
    expect(HELP).toContain('--no-register');
    expect(HELP).toContain('TEAMTRAIL_NO_REGISTER');
  });

  it('projects_status lists the other projects read-only, never this one', async () => {
    registerProject({ configDir: path.join(tmp, 'config'), root });
    const agent = new TrailAgent({ root, agent: 'claude-01', pollMs: 20 });
    const server = createMcpServer(agent, '0.0.0-test');
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'claude-code', version: '1.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const tool = (await client.listTools()).tools.find((t) => t.name === 'projects_status');
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    const r = (await client.callTool({ name: 'projects_status', arguments: {} })) as { content: { text: string }[] };
    const status = JSON.parse(r.content[0].text) as { projects: { project: string; questionsWaiting: number }[] };
    expect(status.projects.map((p) => [p.project, p.questionsWaiting])).toEqual([['billing', 1]]);
    agent.close();
    await client.close();
  });
});
