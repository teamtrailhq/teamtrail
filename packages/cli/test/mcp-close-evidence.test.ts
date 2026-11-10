import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MarkdownAdapter } from '@teamtrail/core';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agents } from './fakes/agents';

vi.mock('@teamtrail/core/agents', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  collectEvidence: async () => {
    throw new Error('git exploded');
  },
}));

let root: string;
const hub = agents(() => root);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-close-evidence-'));
});
afterEach(async () => {
  await hub.closeAll();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a close without verification whose changes cannot be read', () => {
  it('is flagged to the human, not passed over in silence', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const m = await call<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
      discovery: false,
      title: 'R',
      destination: 'D',
      tickets: [{ ref: 'r', title: 'Look around', type: 'research' }],
    });
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const done = await call<{ warning?: string }>('close_ticket', { resolution: 'Found it' });
    expect(done.warning).toMatch(/could not read the files changed since the claim \(git exploded\)/);
    const t = (await new MarkdownAdapter(nodeMarkdownFs(root), root).loadMap(m.trail.id)).tickets[0];
    expect(t.comments.some((c) => c.body.startsWith('**Closed without verification; changes unknown**'))).toBe(true);
  });
});
