import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { applyCall, withCurrentHashes } from '@teamtrail/core';
import { approveKnowledgeHere, blobHash, readKnowledge, writeKnowledge } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importKnowledge } from '../src/knowledgeImport';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';

let repo: string;
let root: string;
const open: { close(): void | Promise<void> }[] = [];

async function connect() {
  const agent = new TrailAgent({ root, agent: 'claude-01', pollMs: 20 });
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

/** The trail lead's confirm, as the Lookout does it (records the anchored files' hashes). */
/** The trail lead confirming an entry in the Lookout, on this machine. */
const confirm = (id: string) => {
  const confirmed = withCurrentHashes(applyCall(readKnowledge(root, id)!, { kind: 'confirm' }), (p) =>
    blobHash(repo, p),
  );
  writeKnowledge(root, confirmed);
  approveKnowledgeHere(root, confirmed, 'trail lead');
};

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-knowledge-'));
  fs.mkdirSync(path.join(repo, '.git'));
  fs.mkdirSync(path.join(repo, 'src/notify'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src/notify/service.ts'), 'export const send = () => {};\n');
  root = path.join(repo, '.teamtrail');
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

type Claimed = { knowledge?: { id: string; why: string[]; status: string; mayBeOutdated?: string[] }[] };

describe('project knowledge over MCP', () => {
  it('suggestions wait for review; confirmed entries arrive with the claim, with why, and go stale on change', async () => {
    const call = await connect();
    await call('start_trail', {
      discovery: false,
      title: 'Reminders',
      destination: 'D',
      tickets: [{ ref: 'b', title: 'Build reminders', type: 'task', body: 'Send through `src/notify/service.ts`.' }],
    });
    const p = await call<{ proposed: { id: string; status: string } }>('propose_knowledge', {
      kind: 'convention',
      title: 'Notifications go through NotifyService',
      body: 'Never call providers directly; use src/notify/service.ts.',
      scope: ['src/notify/**'],
      files: ['src/notify/service.ts'],
    });
    expect(p.proposed.status).toBe('suggested');
    const search = await call<{ entries: { id: string; status: string }[] }>('search_knowledge', {
      query: 'NotifyService',
    });
    expect(search.entries).toEqual([expect.objectContaining({ id: p.proposed.id, status: 'suggested' })]);

    // Not delivered until confirmed.
    expect((await call<Claimed>('next_ticket')).knowledge).toBeUndefined();
    confirm(p.proposed.id);
    const claimed = await call<Claimed>('claim_ticket');
    expect(claimed.knowledge).toEqual([expect.objectContaining({ id: p.proposed.id, status: 'confirmed' })]);
    expect(claimed.knowledge?.[0].why).toEqual(['path match src/notify/** (src/notify/service.ts)', 'same trail']);
    expect(claimed.knowledge?.[0].mayBeOutdated).toBeUndefined();

    // The anchored file changes: the entry is still delivered, marked for re-confirmation.
    fs.writeFileSync(path.join(repo, 'src/notify/service.ts'), 'export const send = (to: string) => to;\n');
    const after = await call<Claimed>('resume_trail');
    expect(after.knowledge?.[0].mayBeOutdated).toEqual(['src/notify/service.ts']);

    // Agents flag what contradicts the code; only the trail lead resolves it.
    await call('flag_knowledge', { id: p.proposed.id, reason: 'service.ts now takes a recipient' });
    expect(readKnowledge(root, p.proposed.id)?.flag?.reason).toBe('service.ts now takes a recipient');
    await expect(call('propose_knowledge', { kind: 'nope', title: 't', body: 'b' })).rejects.toThrow();
  });

  it('imports a spec as suggestions', () => {
    const spec = path.join(repo, 'spec.md');
    fs.writeFileSync(spec, '# Spec\n\n## Personas\n\nTherapists.\n\n## Pricing\n\nPro is $20.\n');
    expect(importKnowledge(root, spec)).toEqual(['K-1', 'K-2']);
    expect(readKnowledge(root, 'K-2')).toMatchObject({
      title: 'Pricing',
      status: 'suggested',
      sources: ['import:spec.md'],
    });
  });
});
