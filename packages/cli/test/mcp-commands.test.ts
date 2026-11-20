import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { applyCall, withCurrentHashes } from '@teamtrail/core';
import {
  approveKnowledgeHere,
  blobHash,
  chooseMain,
  localRepoFiles,
  readKnowledge,
  writeKnowledge,
} from '@teamtrail/core/agents';
import { proposeCommandNotes, type PackageCommands } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { callTool } from './fakes/callTool';
import { approveAllHere } from './fakes/trailLead';

let top: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
  fs.writeFileSync(path.join(top, rel), text);
};

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

/** The trail lead confirms a note as the Lookout's knowledge call does: its anchors hashed, approved here. */
function confirm(id: string) {
  const e = readKnowledge(root, id)!;
  const next = withCurrentHashes(applyCall(e, { kind: 'confirm' }), (p) => blobHash(top, p));
  writeKnowledge(root, next);
  approveKnowledgeHere(root, next, 'trail lead');
}

beforeEach(() => {
  top = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-commands-')), 'app');
  root = path.join(top, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  sh(top, 'init', '-q', '-b', 'main');
  write('package.json', JSON.stringify({ name: 'shop', private: true, workspaces: ['apps/*'] }));
  write('package-lock.json', JSON.stringify({ name: 'shop', lockfileVersion: 3, packages: {} }));
  write('.env.example', 'DATABASE_URL=\n');
  write(
    'apps/web/package.json',
    JSON.stringify({ name: 'web', scripts: { test: 'node --test', dev: 'vite' }, devDependencies: { karma: '6' } }),
  );
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, checks: { 'web-test': { run: ['npm', 'test'], cwd: 'apps/web' } }, run: ['web-test'] }),
  );
  approveAllHere(root);
  sh(top, 'add', '-A', '--', '.', ':(exclude).teamtrail');
  sh(top, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(path.dirname(top), { recursive: true, force: true });
});

describe("the project's commands on a claim", () => {
  it('suggested notes wait; once confirmed the claim carries them, with setup, checks and needs', async () => {
    const proposed = await proposeCommandNotes({ root, files: localRepoFiles(top) });
    expect(proposed.added).toHaveLength(2);
    expect(await proposeCommandNotes({ root, files: localRepoFiles(top) })).toMatchObject({ added: [], updated: [] });
    const call = await connect();
    const m = await call<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
      discovery: false,
      title: 'Search',
      destination: 'Readers find a release',
      tickets: [{ ref: 'a', title: 'Search box', type: 'execute' }],
    });
    await call('next_ticket');
    chooseMain({ root, mapId: m.trail.id, choice: { kind: 'proceed' } });
    const first = await call<{ commands?: PackageCommands[] }>('claim_ticket', {
      ticket: m.tickets[0].key,
      touches: ['apps/web/src/**'],
    });
    const [web] = first.commands!;
    expect(web.package).toBe('apps/web');
    expect(web.notes).toBeUndefined();
    expect(web.waiting).toMatch(/waits for the trail lead/);
    expect(web.checks).toEqual([{ name: 'web-test', run: 'npm test', cwd: 'apps/web' }]);
    expect(web.needs?.map((n) => n.name)).toEqual(['karma']);
    const webNote = proposed.added.find((id) => readKnowledge(root, id)!.scope.includes('apps/web/**'))!;
    confirm(webNote);
    // claimed again (as an agent resuming does): the confirmed note now comes with it
    const second = await call<{ commands?: PackageCommands[] }>('claim_ticket', {
      ticket: m.tickets[0].key,
      touches: ['apps/web/**'],
    });
    const [now] = second.commands!;
    expect(now.notes?.id).toBe(webNote);
    expect(now.notes?.body).toContain('- Test: `npm test` in apps/web');
    expect(now.notes?.body).toContain('- Run: `npm run dev` in apps/web');
    expect(now.notes?.mayBeOutdated).toBeUndefined();
    write('apps/web/package.json', JSON.stringify({ name: 'web', scripts: { test: 'vitest' } }));
    const again = await proposeCommandNotes({ root, files: localRepoFiles(top) });
    expect(again.updated).toContain(webNote);
    expect(readKnowledge(root, webNote)!.status, 'a changed manifest: confirm it again').toBe('suggested');
  });
});
