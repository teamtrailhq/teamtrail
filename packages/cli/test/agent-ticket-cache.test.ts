import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryAdapter } from '@teamtrail/core';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentContext } from '../src/mcp/trail/agentContext';

const sections = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("an agent's ticket cache", () => {
  it('keeps two trails apart when their tickets share an id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-ticket-cache-'));
    dirs.push(root);
    const tracker = new MemoryAdapter({ latency: [0, 0] });
    const a = await tracker.createMap({ title: 'A', sections });
    const task = await tracker.createTicket(a.id, { title: 'Build', type: 'task', body: '' });
    // trail B arrived with the same ticket id (two branches merged): a junction there, waiting on the human
    const b = { ...a, id: 'map-b', key: '#90', title: 'B' };
    tracker.seed({ map: b, tickets: [{ ...task, key: 'B-1', type: 'junction', hitl: true }] });
    const ctx = new AgentContext({ root, tracker });
    await ctx.load(b.id);
    await ctx.load(a.id);
    expect(ctx.seen(b.id, task.id)?.key).toBe('B-1');
    expect(ctx.seen(a.id, task.id)?.type).toBe('task');
    expect(ctx.keyOf(task.id, b.id)).toBe('B-1');
    expect(ctx.keyOf(task.id, a.id)).toBe(task.key);
    ctx.close('done');
  });
});
