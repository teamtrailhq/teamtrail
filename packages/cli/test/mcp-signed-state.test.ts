import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { outsideChanges, readStateRecord } from '@teamtrail/core/agents';
import { createTrackerBridge, type TrackerBridge } from '@teamtrail/core/bridge';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';

/*
 * Signed state over MCP: an agent's writes through the tools are signed as its own and raise no flag, and an edit
 * made to the files instead of through the tools doesn't move a gate.
 */
let root: string;
let bridge: TrackerBridge;
let server: http.Server;
let base: string;
const open: { close(): void | Promise<void> }[] = [];

async function connect(agentName = 'claude-01') {
  const agent = new TrailAgent({ root, agent: agentName, pollMs: 20 });
  const mcp = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([mcp.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return async <T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}

const post = async (p: string, body: unknown) => {
  const r = await fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};
const get = async (p: string) => (await (await fetch(base + p)).json()) as Record<string, unknown>;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-signed-mcp-'));
  bridge = createTrackerBridge(root, { env: {}, configDir: path.join(root, '..', 'cfg-' + path.basename(root)) });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  bridge.close();
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

type Started = { trail: { id: string; key: string }; tickets: { ref?: string; key: string; title: string }[] };

async function start(call: Awaited<ReturnType<typeof connect>>) {
  const started = await call<Started>('start_trail', {
    discovery: false,
    title: 'Batch sync',
    destination: 'Edits sync in batches',
    tickets: [
      { ref: 'look', title: 'Check the v2 API', type: 'research' },
      { ref: 'pick', title: 'Pick the queue', type: 'junction' },
      { ref: 'batch', title: 'Batch writes', type: 'execute', blockedBy: ['look'] },
    ],
    assumptions: [{ text: 'The v2 API supports batch writes', tickets: ['batch'] }],
  });
  const key = (ref: string) => started.tickets.find((t) => t.ref === ref)!.key;
  return { mapId: started.trail.id, key };
}

describe('signed state over MCP', () => {
  it('claim, close, record_decision and an approved reroute are signed, and nothing is flagged', async () => {
    const call = await connect();
    const { mapId, key } = await start(call);
    await call('claim_ticket', { ticket: key('look') });
    await call('close_ticket', { resolution: 'No batch endpoint in v2.', assumes: ['S-1'] });
    await call('record_decision', { question: 'Retry?', answer: 'Three times, then park it.' });
    await call('challenge_assumption', { assumption: 'S-1', evidence: 'docs/v2.md lists POST /items only' });
    await call('propose_reroute', {
      reason: 'No batch API',
      evidence: 'docs/v2.md',
      invalidates: ['S-1'],
      changes: [
        { op: 'cancel_ticket', ticket: key('batch'), reason: 'No batch API' },
        { op: 'add_ticket', ref: 'queue', title: 'Queue single writes', type: 'execute' },
      ],
    });
    const { reroute } = (await get(`/reroutes/R-1?map=${mapId}`)) as { reroute: { hash: string } };
    expect((await post('/reroutes/approve', { mapId, id: 'R-1', hash: reroute.hash })).status).toBe(200);
    await call('reroute_status', { wait: true, waitSeconds: 1 });

    const out = outsideChanges(root);
    expect(out.problems).toEqual([]);
    expect(out.changes).toEqual([]);
    expect(out.textEdits).toEqual([]);
    const entries = readStateRecord(root, mapId).entries;
    expect(Object.keys(entries)).toEqual(expect.arrayContaining(['map', 'decision:D-1', 'decision:D-2']));
    expect(Object.values(entries).some((e) => e.by === 'agent claude-01 via MCP')).toBe(true);
    expect(await get('/signed-state')).toEqual({ problems: [], changes: [], textEdits: [] });
  });

  it('a junction turned into a task in its file is held, and Revert puts the junction back', async () => {
    const call = await connect();
    const { mapId, key } = await start(call);
    const id = key('pick').slice(1);
    const file = path.join(root, mapId, 'tickets', `${id}.md`);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^type: junction$/m, 'type: task'));
    // held for the human: no agent can take it until they accept or revert the edit
    await expect(call('claim_ticket', { ticket: key('pick') })).rejects.toThrow();
    const listed = (await get('/signed-state')) as { changes: { id: string; fields: string[] }[] };
    expect(listed.changes).toEqual([expect.objectContaining({ id, fields: ['type'] })]);
    const { items } = (await get('/trust')) as { items: { key: string; kind: string; hash: string }[] };
    const item = items.find((i) => i.kind === 'state')!;
    expect((await post('/trust/revert', { key: item.key, hash: item.hash })).status).toBe(200);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/^type: junction$/m);
    const claimed = await call<{ claimed: { key: string } }>('claim_ticket', { ticket: key('pick') });
    expect(claimed.claimed.key).toBe(key('pick'));
  });

  it('the Lookout’s write never signs an outside change it didn’t make', async () => {
    const call = await connect();
    const { mapId, key } = await start(call);
    const rel = `${mapId}/tickets/${key('look').slice(1)}.md`;
    const file = path.join(root, rel);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^state: open$/m, 'state: closed'));
    // The page reads the ticket as Teamtrail does, adds a comment, writes it back.
    const shown = await (await fetch(`${base}/file?path=${encodeURIComponent(rel)}`)).text();
    expect(shown).toMatch(/^state: open$/m);
    const edited = shown.replace(
      /\n$/,
      '\n\n## Comments\n<!-- teamtrail:comments -->\n\n### trail lead @ 2026-01-01T00:00:00.000Z\n\nLooks good\n',
    );
    expect((await fetch(`${base}/file?path=${encodeURIComponent(rel)}`, { method: 'PUT', body: edited })).status).toBe(
      200,
    );
    expect(fs.readFileSync(file, 'utf8')).toMatch(/^state: closed$/m);
    expect(outsideChanges(root).changes.map((c) => c.fields)).toEqual([['state']]);
  });
});
