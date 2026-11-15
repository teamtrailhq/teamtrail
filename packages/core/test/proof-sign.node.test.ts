import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { machineProofKey, PROOF_KEY_FILE } from '../src/machine/proofKey';
import type { Proof } from '../src/model/proof';
import { buildProof } from '../src/proof/buildProof';
import { parseProofKeys } from '../src/proof/parseProofKeys';
import { proofKeysAt } from '../src/proof/proofKeysAt';
import { proofMarkdown } from '../src/proof/proofMarkdown';
import { signedProofMarkdown } from '../src/proof/signedProofMarkdown';
import { verifyProofText } from '../src/proof/verifyProofText';

const HEAD = 'c'.repeat(40);
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'teamtrail-proofsign-'));

function proof(): Proof {
  return buildProof({
    ticket: { mapId: 'm1', id: '6', key: '#6', title: 'Free shipping', type: 'execute' },
    trail: 'Checkout',
    attempts: [
      {
        v: 1,
        id: 'A-1',
        mapId: 'm1',
        ticketId: '6',
        ticketKey: '#6',
        agent: 'claude-01',
        level: 'checks',
        configHash: 'h',
        submittedAt: 1,
        finishedAt: 2,
        resolution: 'done',
        checks: [],
        result: 'pass',
        git: {
          v: 1,
          tree: { toplevel: '/r', head: HEAD, branch: 'b', fingerprint: 'sha256:0' },
          changed: [],
          stats: { files: 1, add: 1, del: 0 },
          flags: [],
        },
      },
    ],
    verdicts: [],
    decisions: [],
  });
}

function signed() {
  const root = tmp();
  const config = tmp();
  const out = signedProofMarkdown(root, proof(), config);
  const keys = parseProofKeys([readFileSync(path.join(root, out.keyFile!), 'utf8')]);
  return { root, config, keys, ...out };
}

test('one key per machine, private to its user, made once and kept', () => {
  const config = tmp();
  const a = machineProofKey(config);
  const b = machineProofKey(config);
  assert.equal(a.id, b.id);
  assert.match(a.id, /^[0-9a-f]{16}$/);
  if (process.platform !== 'win32') assert.equal(statSync(path.join(config, PROOF_KEY_FILE)).mode & 0o777, 0o600);
});

test("a signed report verifies with the repo's key, and its public key is put in the tracker folder", () => {
  const { markdown, keys, keyFile, signature } = signed();
  assert.match(keyFile!, /^proof-keys\/[0-9a-f]{16}\.pub$/);
  assert.ok(markdown.startsWith(`<!-- teamtrail:proof v1 sha256:`));
  assert.ok(markdown.includes(`key:${signature!.keyId} sig:`));
  const c = verifyProofText({ text: `Some PR text\n\n${markdown}\n\nmore`, keys, head: HEAD });
  assert.deepEqual(c.problems, []);
  assert.equal(c.verified, true);
});

test('an edited, forged, unsigned or stale report does not verify, and says why', () => {
  const { markdown, keys } = signed();
  const edited = markdown.replace('Free shipping', 'Free shipping for everyone');
  assert.deepEqual(verifyProofText({ text: edited, keys }).problems, [
    "The report's text was edited after Teamtrail wrote it.",
  ]);

  const p = proof();
  const forged = { ...p, status: 'verified' as const, trail: 'Elsewhere' };
  const data = Buffer.from(JSON.stringify(forged)).toString('base64');
  const swapped = markdown.replace(/proof-data [A-Za-z0-9+/=]+/, `proof-data ${data}`);
  assert.match(verifyProofText({ text: swapped, keys }).problems[0], /doesn't match its digest/);

  const other = signedProofMarkdown(tmp(), proof(), tmp());
  assert.match(verifyProofText({ text: other.markdown, keys }).problems[0], /not one of the repo's proof keys/);
  assert.deepEqual(verifyProofText({ text: proofMarkdown(proof()), keys }).problems, ['The report is not signed.']);
  const stale = verifyProofText({ text: markdown, keys, head: 'd'.repeat(40) });
  assert.equal(stale.valid, true);
  assert.equal(stale.verified, false);
  assert.match(stale.problems[0], /^Verified at ccccccc, not at ddddddd/);
  assert.deepEqual(verifyProofText({ text: 'nothing here', keys }).problems, ['No Teamtrail proof in this text.']);
});

test('keys are read from a commit, never from the working tree', async () => {
  const repo = tmp();
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e', ...args], { cwd: repo, stdio: 'pipe' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'start');
  const first = signedProofMarkdown(root, proof(), tmp());
  assert.equal((await proofKeysAt(root, 'HEAD')).size, 0, 'an uncommitted key counts for nothing');
  git('add', '.');
  git('commit', '-q', '-m', 'key');
  const keys = await proofKeysAt(root, 'HEAD');
  assert.ok(keys.has(first.signature!.keyId));
  assert.equal((await proofKeysAt(root, '--output=x')).size, 0);
});
