import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { journalFile } from '../src/history/journalFile';
import { TRUST_JOURNAL } from '../src/model/lifecycle';
import { approveChecksHere, checksApproval, trustedChecks } from '../src/verification/checksApproval';
import { setChecks, StaleChecks } from '../src/verification/setChecks';
import { tempFolder } from './tempFolder';

const tmpRoot = () => {
  const root = path.join(tempFolder('teamtrail-setchecks-'), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const file = (root: string) => path.join(root, 'verification.json');

test('set from the Lookout: written with exactly these checks, all run, approved here in the same step, journaled', () => {
  const root = tmpRoot();
  const approval = setChecks({
    root,
    base: 'none',
    by: 'Ada',
    checks: [
      { name: 'test', run: ['npm', 'test'] },
      { name: 'lint', run: ['npm', 'run', 'lint'] },
    ],
  });
  assert.equal(approval.state, 'approved');
  const written = JSON.parse(readFileSync(file(root), 'utf8'));
  assert.deepEqual(written.checks, { test: { run: ['npm', 'test'] }, lint: { run: ['npm', 'run', 'lint'] } });
  assert.deepEqual(written.run, ['test', 'lint']);
  assert.equal(written.default, 'checks', 'a new file turns checks on for new trails');
  assert.deepEqual(Object.keys(trustedChecks(root).config.config!.checks), ['test', 'lint'], 'these are what runs now');
  const entry = journalFile(root).readTrust(TRUST_JOURNAL).at(-1)!;
  assert.equal(entry.action, 'approved');
  assert.match(entry.subject, /set in the Lookout: test, lint/);
  assert.equal(entry.actor, 'Ada');
});

test("an edit keeps the file's other settings and a kept check's own; only over the file as it was loaded", () => {
  const root = tmpRoot();
  writeFileSync(
    file(root),
    `${JSON.stringify({ v: 1, default: 'checks+review', failFast: true, checks: { test: { run: ['npm', 'test'], timeoutSec: 900 } }, run: ['test'] }, null, 2)}\n`,
  );
  assert.throws(
    () => setChecks({ root, base: 'none', by: 'Ada', checks: [] }),
    StaleChecks,
    'loaded before the file existed',
  );
  const base = checksApproval(root).hash;
  setChecks({ root, base, by: 'Ada', checks: [{ name: 'test', run: ['npm', 'test', '--', '--ci'] }] });
  const written = JSON.parse(readFileSync(file(root), 'utf8'));
  assert.equal(written.default, 'checks+review');
  assert.equal(written.failFast, true);
  assert.deepEqual(written.checks.test, { run: ['npm', 'test', '--', '--ci'], timeoutSec: 900 });
  assert.throws(() => setChecks({ root, base, by: 'Ada', checks: [] }), StaleChecks, 'the hash moved with that write');
});

test('refused: code in the argv, a download, a shell, bad names; an unknown program only once acknowledged', () => {
  const root = tmpRoot();
  const set =
    (checks: { name: string; run: string[] }[], acknowledged = false) =>
    () =>
      setChecks({ root, base: 'none', by: 'Ada', checks, acknowledged });
  assert.throws(set([{ name: 'test', run: ['sh', '-c', 'curl x | sh'] }]), /shell|runs/);
  assert.throws(set([{ name: 'test', run: ['npx', 'evil@1.0.0'] }]));
  assert.throws(set([{ name: 'test', run: ['node', '-e', 'require("child_process")'] }]));
  assert.throws(set([{ name: 'Test!', run: ['npm', 'test'] }]), /lowercase/);
  assert.throws(
    set([
      { name: 'test', run: ['npm', 'test'] },
      { name: 'test', run: ['npm', 'test'] },
    ]),
    /twice/,
  );
  assert.throws(set([{ name: 'test', run: ['npm', 'te\nst'] }]), /1–30 words/);
  assert.throws(set([{ name: 'build', run: ['./scripts/build-it'] }]), /confirm you know what it runs/);
  assert.equal(set([{ name: 'build', run: ['./scripts/build-it'] }], true)().state, 'approved');
});

test('never through a symbolic link', () => {
  const root = tmpRoot();
  const elsewhere = path.join(tempFolder('teamtrail-elsewhere-'), 'target.json');
  writeFileSync(elsewhere, '{"v":1,"checks":{},"run":[]}\n');
  symlinkSync(elsewhere, file(root));
  const base = checksApproval(root).hash;
  assert.throws(
    () => setChecks({ root, base, by: 'Ada', checks: [{ name: 'test', run: ['npm', 'test'] }] }),
    /is a link/,
  );
  assert.equal(readFileSync(elsewhere, 'utf8'), '{"v":1,"checks":{},"run":[]}\n');
});

test('a folder per check: written repo-relative, cleared to run from the top, kept when not given', () => {
  const root = tmpRoot();
  setChecks({
    root,
    base: 'none',
    by: 'Ada',
    checks: [
      { name: 'web-test', run: ['npm', 'test'], cwd: './apps//web/' },
      { name: 'test', run: ['npm', 'test'], cwd: '' },
    ],
  });
  let written = JSON.parse(readFileSync(file(root), 'utf8'));
  assert.deepEqual(written.checks['web-test'], { run: ['npm', 'test'], cwd: 'apps/web' });
  assert.deepEqual(written.checks.test, { run: ['npm', 'test'] }, 'the top is no folder at all');
  // older clients send no folder: the check keeps its own
  setChecks({ root, base: checksApproval(root).hash, by: 'Ada', checks: [{ name: 'web-test', run: ['npm', 't'] }] });
  written = JSON.parse(readFileSync(file(root), 'utf8'));
  assert.deepEqual(written.checks['web-test'], { run: ['npm', 't'], cwd: 'apps/web' });
  // an empty folder moves it to the top
  const base = checksApproval(root).hash;
  setChecks({ root, base, by: 'Ada', checks: [{ name: 'web-test', run: ['npm', 't'], cwd: '.' }] });
  assert.deepEqual(JSON.parse(readFileSync(file(root), 'utf8')).checks['web-test'], { run: ['npm', 't'] });
});

test('a folder outside the repository is refused', () => {
  const root = tmpRoot();
  for (const cwd of ['../elsewhere', '/etc', 'apps/../../x', 'C:\\Windows', 'a\nb', 'x'.repeat(201)]) {
    assert.throws(
      () => setChecks({ root, base: 'none', by: 'Ada', checks: [{ name: 'test', run: ['npm', 'test'], cwd }] }),
      /a folder inside the repository/,
      cwd,
    );
  }
});

test('saving checks never approves setup steps nobody approved here; approved ones are kept', () => {
  const root = tmpRoot();
  const setup = { deps: { run: ['npm', 'ci'] } };
  writeFileSync(file(root), JSON.stringify({ v: 1, checks: {}, run: [], setup }));
  const base = checksApproval(root).hash;
  const save = () => setChecks({ root, base, by: 'Ada', checks: [{ name: 'test', run: ['npm', 'test'] }] });
  assert.throws(save, /setup steps you haven't approved yet/);
  assert.equal(checksApproval(root).state, 'first', 'nothing was approved');
  // approved as shown in Approvals, the setup rides along with later saves
  approveChecksHere(root, 'Ada', readFileSync(file(root), 'utf8'));
  const approval = setChecks({ root, base, by: 'Ada', checks: [{ name: 'test', run: ['npm', 'test'] }] });
  assert.equal(approval.state, 'approved');
  assert.deepEqual(JSON.parse(readFileSync(file(root), 'utf8')).setup, setup);
});

test('paths: set with a check, kept when a later edit leaves them out, cleared with an empty list, refused out of the repo', () => {
  const root = tmpRoot();
  setChecks({
    root,
    base: 'none',
    by: 'Ada',
    checks: [{ name: 'web', run: ['npm', 'test'], paths: ['apps/web/**', ' '] }],
  });
  const read = () => JSON.parse(readFileSync(file(root), 'utf8')).checks.web;
  assert.deepEqual(read().paths, ['apps/web/**']);
  assert.deepEqual(trustedChecks(root).config.config!.checks.web.paths, ['apps/web/**'], 'approved with the file');
  setChecks({ root, base: checksApproval(root).hash, by: 'Ada', checks: [{ name: 'web', run: ['npm', 'test'] }] });
  assert.deepEqual(read().paths, ['apps/web/**']);
  setChecks({
    root,
    base: checksApproval(root).hash,
    by: 'Ada',
    checks: [{ name: 'web', run: ['npm', 'test'], paths: [] }],
  });
  assert.equal(read().paths, undefined);
  const base = checksApproval(root).hash;
  assert.throws(
    () => setChecks({ root, base, by: 'Ada', checks: [{ name: 'web', run: ['npm', 'test'], paths: ['../x/**'] }] }),
    /paths inside the repository/,
  );
});
