import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agents } from './fakes/agents';

/** Files another process created after this one listed the folder: on disk, not yet in the listing. */
const unseen = new Set<string>();

vi.mock('node:fs', async (original) => {
  const real = await original<typeof fs>();
  const list = real.readdirSync as unknown as (...args: unknown[]) => string[];
  const readdirSync = ((...args: unknown[]) =>
    list(...args).filter((n) => !unseen.has(n))) as unknown as typeof real.readdirSync;
  return { ...real, readdirSync, default: { ...real, readdirSync } };
});

let root: string;
const hub = agents(() => root);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-knowledge-race-'));
});
afterEach(async () => {
  unseen.clear();
  await hub.closeAll();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('propose_knowledge across processes', () => {
  it('never overwrites an entry another agent wrote between the listing and the write', async () => {
    fs.mkdirSync(path.join(root, 'knowledge'));
    const theirs = '---\ntitle: Theirs\nkind: gotcha\nstatus: suggested\n---\n\nAnother agent wrote this.\n';
    fs.writeFileSync(path.join(root, 'knowledge', 'K-1.md'), theirs);
    unseen.add('K-1.md');
    const call = await hub.connect({ name: 'claude-01' });
    const r = await call<{ proposed: { id: string } }>('propose_knowledge', {
      kind: 'gotcha',
      title: 'Mine',
      body: 'This agent wrote this.',
    });
    expect(r.proposed.id).toBe('K-2');
    expect(fs.readFileSync(path.join(root, 'knowledge', 'K-1.md'), 'utf8')).toBe(theirs);
  });
});
