import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { journalFile } from '../src/history/journalFile';
import { TRUST_JOURNAL } from '../src/model/lifecycle';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';
import { checksApproval, trustedChecks } from '../src/verification/checksApproval';
import { setChecks, StaleChecks } from '../src/verification/setChecks';
import { setScope } from '../src/verification/setScope';
import { tempFolder } from './tempFolder';

/* What a change outside the files an agent declared does, as the trail lead sets it in Settings → Verification. */
const tmpRoot = () => {
  const root = path.join(tempFolder('teamtrail-setscope-'), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const file = (root: string) => path.join(root, 'verification.json');
const withChecks = () => {
  const root = tmpRoot();
  setChecks({ root, base: 'none', by: 'Ada', checks: [{ name: 'test', run: ['npm', 'test'] }] });
  return root;
};

test('set and approved in one step, the checks untouched, journaled', () => {
  const root = withChecks();
  const approval = setScope({ root, scope: 'fail', base: checksApproval(root).hash, by: 'Ada' });
  assert.equal(approval.state, 'approved');
  const written = JSON.parse(readFileSync(file(root), 'utf8'));
  assert.equal(written.scope, 'fail');
  assert.deepEqual(written.checks, { test: { run: ['npm', 'test'] } });
  assert.equal(trustedChecks(root).config.config?.scope, 'fail', 'what runs now');
  const entry = journalFile(root).readTrust(TRUST_JOURNAL).at(-1)!;
  assert.match(entry.subject, /outside the declared files: sent back for rework/);
  assert.equal(entry.actor, 'Ada');
});

test('only over the file as it was loaded, and never approving commands nobody looked at', () => {
  const root = withChecks();
  assert.throws(() => setScope({ root, scope: 'human', base: 'none', by: 'Ada' }), StaleChecks);
  const edited = { ...JSON.parse(readFileSync(file(root), 'utf8')), checks: { test: { run: ['npm', 'run', 'evil'] } } };
  writeFileSync(file(root), JSON.stringify(edited));
  assert.throws(
    () => setScope({ root, scope: 'human', base: checksApproval(root).hash, by: 'Ada' }),
    /Approve verification.json first/,
  );
  assert.equal(checksApproval(root).waiting, true, 'the edited commands still wait');
});

test('needs the checks first, and one of flag, fail or human', () => {
  const root = tmpRoot();
  assert.throws(() => setScope({ root, scope: 'fail', base: 'none', by: 'Ada' }), /Set the checks first/);
  const set = withChecks();
  assert.throws(() => setScope({ root: set, scope: 'block', base: checksApproval(set).hash, by: 'Ada' }), /"scope"/);
});

test('only the machine Teamtrail runs on sets it', () => {
  assert.equal(thisMachineOnly('PUT', '/verification/scope'), true);
});
