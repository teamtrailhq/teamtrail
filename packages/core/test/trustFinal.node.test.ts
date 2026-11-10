import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { acceptedSettingsFile, acceptedSettingsPath } from '../src/adapters/remote/acceptedSettingsFile';
import { outboxKey } from '../src/adapters/remote/outboxFile';
import { chartMap } from '../src/planning/operations/chart';
import { approveTogether } from '../src/trust/approveTogether';
import { pendingTrust } from '../src/trust/pendingTrust';
import { trustKey, trustLedger } from '../src/trust/trustLedger';
import { checkoutFor } from '../src/verification/checkoutFor';
import { recordWorktree } from '../src/workspaces/trustedWorkspace';
import { writeWorkspace } from '../src/workspaces/workspaceStore';
import { approveAllHere } from './fakes/trailLead';

/* The last re-check of PR #60 (N5b, N7, N9). Each test failed before its fix. */
const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-final-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};

test('N5b: deleting its own workspace record never gets a ticket graded on the main checkout', () => {
  const root = tmpRoot();
  const wt = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-wt-'));
  const rec = {
    v: 1,
    mapId: 'm1',
    ticketId: '1',
    ticketKey: '#1',
    agent: 'a',
    createdAt: 1,
    path: wt,
    branch: 'b',
    base: 'c',
  };
  writeWorkspace(root, rec as never);
  recordWorktree(root, { mapId: 'm1', ticketId: '1', path: wt });
  rmSync(path.join(root, '.agents', 'workspaces', 'm1--1.json'));
  const c = checkoutFor({ root }, 'm1', '1');
  assert.equal(c.kind, 'here');
  assert.equal(c.kind === 'here' && path.basename(c.path), path.basename(wt), 'graded where Teamtrail prepared it');
  rmSync(wt, { recursive: true });
  assert.equal(checkoutFor({ root }, 'm1', '1').kind, 'none', 'and not on main when that worktree is gone');
});

test('N7: on the first run, a level with no file to check in git is never adopted in bulk below the default', async () => {
  const root = tmpRoot();
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: path.dirname(root) });
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, default: 'checks', checks: { t: { run: ['npm', 'test'] } }, run: ['t'] }),
  );
  writeFileSync(path.join(root, 'policy.json'), JSON.stringify({ v: 1, categories: { schema: 'low' } }));
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'team');
  // a trail on a remote tracker (no file), lowered to off by someone else
  const remoteSnap = (id: string, verification: 'off' | 'checks+review') => ({
    map: {
      id,
      key: id,
      title: id,
      mode: 'plan+execute' as const,
      sections: {} as never,
      createdAt: 0,
      updatedAt: 0,
      verification,
    },
    tickets: [],
  });
  const snaps = [remoteSnap('7', 'off'), remoteSnap('8', 'checks+review')];
  const items = pendingTrust(root, snaps).map((i) => ({ key: i.key, hash: i.hash }));
  const r = await approveTogether({ root, items, by: 'trail lead', snaps });
  assert.ok(r.refused.includes('level:7'), 'lowered below the default: its own look');
  assert.ok(r.approved.includes('level:8'), 'at least the default: may come along');
});

test("N9: repos whose names differ only in '.' and '_' never share a queue or a record", async () => {
  assert.notEqual(outboxKey('github', 'org/a.b'), outboxKey('github', 'org/a_b'));
  const root = tmpRoot();
  // a record written under the old key is moved to the new one on first use
  const old = 'github-org_a_b';
  const store = acceptedSettingsFile(root, old);
  await store.update(() => ({ '1': { viewer: 'octo', ok: '{}' } }));
  const fresh = acceptedSettingsFile(root, outboxKey('github', 'org/a_b'));
  assert.deepEqual(Object.keys(fresh.read()), ['1']);
  assert.equal(existsSync(acceptedSettingsPath(root, old)), false);
  void trustKey;
  void trustLedger;
  void approveAllHere;
  void MarkdownAdapter;
  void nodeMarkdownFs;
  void chartMap;
});
