import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TicketLease } from '../src';
import { listWorkspaces, prepareWorktree, readWorkspace, removeWorkspace, writeLease } from '../src/agentHost';

const now = Date.UTC(2026, 11, 1, 12);
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repo with one commit and a tracker folder inside it, plus a prepared worktree for ticket #1. */
async function project() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-remove-'));
  dirs.push(base);
  const top = path.join(base, 'app');
  const root = path.join(top, '.teamtrail');
  fs.mkdirSync(root, { recursive: true });
  sh(top, 'init', '-q', '-b', 'main');
  sh(top, 'config', 'user.email', 't@t');
  sh(top, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(top, 'a.txt'), 'a\n');
  sh(top, 'add', '-A');
  sh(top, 'commit', '-qm', 'init');
  const p = await prepareWorktree({
    root,
    repoRoot: top,
    settings: { v: 1, worktrees: true },
    mapId: 'm1',
    ticket: { id: '1', key: '#1' },
    agent: 'claude-01',
    now,
  });
  if (!('workspace' in p)) throw new Error(p.note);
  return { top, root, ws: p.workspace };
}

const lease = (patch: Partial<TicketLease> = {}): TicketLease => ({
  v: 1,
  mapId: 'm1',
  ticketId: '1',
  ticketKey: '#1',
  agent: 'claude-01',
  pid: 1,
  claimedAt: now,
  renewedAt: now,
  ttlMs: 60_000,
  expiresAt: now + 60_000,
  notes: [],
  decisions: [],
  ...patch,
});

describe('removing a finished workspace', () => {
  it('refuses while the ticket is claimed, then removes the folder and keeps the branch', async () => {
    const { top, root, ws } = await project();
    writeLease(root, lease());
    const held = await removeWorkspace({ root, mapId: 'm1', ticketId: '1' });
    expect(held).toMatchObject({ kind: 'refused', reason: expect.stringMatching(/still claimed/) });
    expect(fs.existsSync(ws.path)).toBe(true);

    writeLease(root, lease({ returned: { at: now, reason: 'trail lead', by: 'trail lead' } }));
    const done = await removeWorkspace({ root, mapId: 'm1', ticketId: '1' });
    expect(done.kind).toBe('removed');
    expect(fs.existsSync(ws.path)).toBe(false);
    expect(readWorkspace(root, 'm1', '1')).toBeUndefined();
    expect(listWorkspaces(root)).toEqual([]);
    expect(sh(top, 'branch', '--list', ws.branch)).toContain(ws.branch);
    expect(sh(top, 'worktree', 'list')).not.toContain(ws.path);
  });

  it('asks before losing uncommitted changes, and removes them when forced', async () => {
    const { root, ws } = await project();
    fs.writeFileSync(path.join(ws.path, 'draft.txt'), 'unsaved\n');
    const asked = await removeWorkspace({ root, mapId: 'm1', ticketId: '1' });
    expect(asked).toMatchObject({
      kind: 'refused',
      dirty: true,
      reason: expect.stringMatching(/uncommitted changes \(1 file\)/),
    });
    expect(fs.existsSync(ws.path)).toBe(true);
    expect((await removeWorkspace({ root, mapId: 'm1', ticketId: '1', force: true })).kind).toBe('removed');
    expect(fs.existsSync(ws.path)).toBe(false);
  });

  it('never removes the main checkout, and says when there is nothing to remove', async () => {
    const { top, root, ws } = await project();
    const record = JSON.parse(fs.readFileSync(path.join(root, '.agents/workspaces/m1--1.json'), 'utf8'));
    fs.writeFileSync(path.join(root, '.agents/workspaces/m1--1.json'), JSON.stringify({ ...record, path: top }));
    const main = await removeWorkspace({ root, mapId: 'm1', ticketId: '1' });
    expect(main).toMatchObject({
      kind: 'refused',
      reason: expect.stringMatching(/not one of this repo's worktree folders/),
    });
    expect(fs.existsSync(path.join(top, 'a.txt'))).toBe(true);
    expect(fs.existsSync(ws.path)).toBe(true);
    expect(await removeWorkspace({ root, mapId: 'm1', ticketId: '9' })).toMatchObject({ kind: 'refused' });
  });
});
