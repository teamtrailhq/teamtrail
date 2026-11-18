import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyGuard } from '../src/checkGuard/applyGuard';
import { runnerGuard } from '../src/checkGuard/runnerGuard';
import { journalFile } from '../src/history/journalFile';
import type { AttemptGuard } from '../src/model/checkGuard';
import type { GitEvidence } from '../src/model/evidence';
import type { VerificationAttempt, VerificationVerdict } from '../src/model/verification';
import { buildProof, proofMarkdown } from '../src/node';
import type { CheckRunner } from '../src/verification/checkRunner';
import { parseVerificationConfig } from '../src/verification/config';
import { outcomeOf } from '../src/verification/outcome';

const guard = (mode: AttemptGuard['mode']): AttemptGuard => ({
  mode,
  findings: [{ kind: 'script', file: 'package.json', check: 'test', text: 'package.json scripts.test changed' }],
});

const attempt = (over: Partial<VerificationAttempt> = {}): VerificationAttempt => ({
  v: 1,
  id: 'A1',
  mapId: 'm',
  ticketId: '3',
  ticketKey: '#3',
  agent: 'claude-01',
  level: 'checks',
  configHash: 'h',
  submittedAt: 1,
  finishedAt: 2,
  resolution: 'did it',
  checks: [
    {
      name: 'test',
      argv: ['npm', 'test'],
      cwd: '.',
      exitCode: 0,
      timedOut: false,
      durationMs: 1,
      log: '',
      tail: '',
      truncated: false,
    },
  ],
  result: 'pass',
  ...over,
});

const accepted: VerificationVerdict = {
  v: 1,
  id: 'V1',
  mapId: 'm',
  ticketId: '3',
  attemptId: 'A1',
  by: 'trail lead',
  byKind: 'trail lead',
  verdict: 'PASS',
  summary: 'the old script was wrong',
  findings: [],
  at: 3,
};

const ticket = { mapId: 'm', id: '3', key: '#3', title: 'Ship', type: 'execute' };
const proofOf = (a: VerificationAttempt, verdicts: VerificationVerdict[] = []) =>
  buildProof({ ticket, trail: 'T', attempts: [a], verdicts, decisions: [] });

describe("a check's guards in verification.json", () => {
  const parse = (guards: unknown) =>
    parseVerificationConfig(JSON.stringify({ v: 1, checks: { test: { run: ['npm', 'test'], guards } } }));
  it('takes repo-relative globs and refuses paths out of the repo', () => {
    expect(parse(['fixtures/**', 'scripts/helpers.mjs']).config?.checks.test.guards).toEqual([
      'fixtures/**',
      'scripts/helpers.mjs',
    ]);
    expect(parse(['../secrets']).errors).toEqual(['checks.test.guards must list up to 50 repo-relative path globs']);
    expect(parse('fixtures').errors).toHaveLength(1);
  });
});

describe('a pass the check guard holds', () => {
  it('waits for the trail lead, blocked, with what changed', () => {
    const o = outcomeOf(attempt({ guard: guard('enforce') }), 0, 3);
    expect(o).toEqual({
      event: 'checks.pass',
      to: 'blocked',
      reason: 'A1 passed, but the work changed what its checks run: package.json scripts.test changed',
    });
    expect(outcomeOf(attempt({ guard: guard('observe') }), 0, 3).to).toBe('done');
  });

  it('is a proof gap until the trail lead accepts it, then a line', () => {
    const held = proofOf(attempt({ guard: guard('enforce') }));
    expect(held.status).toBe('not-verified');
    expect(held.gaps).toEqual(['The work changed what its checks run: package.json scripts.test changed.']);
    const ok = proofOf(attempt({ guard: guard('enforce') }), [accepted]);
    expect(ok.status).toBe('verified');
    expect(ok.guard).toEqual({
      mode: 'enforce',
      findings: ['package.json scripts.test changed'],
      accepted: { by: 'trail lead', reason: 'the old script was wrong' },
    });
    expect(proofMarkdown(ok)).toContain(
      '**Changed what its checks run** (accepted by trail lead: the old script was wrong):\n- package.json scripts.test changed',
    );
  });

  it('observed findings show without a gap; an attempt without findings reads as before', () => {
    const seen = proofOf(attempt({ guard: guard('observe') }));
    expect(seen.status).toBe('verified');
    expect(proofMarkdown(seen)).toContain('**Changed what its checks run** (observed, not held):');
    const plain = proofOf(attempt());
    expect(plain.guard).toBeUndefined();
    expect('guard' in plain).toBe(false);
  });

  it('applyGuard flags it for the reviewer, notes why, and journals the gate only on a pass', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'teamtrail-guard-'));
    const git: GitEvidence = { v: 1, changed: [], stats: { files: 0, add: 0, del: 0 }, flags: [] };
    const at = { root, mapId: 'm', ticket: { id: '3', key: '#3' } };
    const held = applyGuard({ result: 'pass' as const, git }, { ...at, guard: guard('enforce') });
    expect(held.note).toContain('the work changed what they run: package.json scripts.test changed');
    expect(git.flags).toMatchObject([{ kind: 'check-guard', level: 'alert', files: ['package.json'] }]);
    applyGuard({ result: 'fail' as const }, { ...at, guard: guard('enforce') });
    expect(journalFile(root).readGates('m')).toMatchObject([
      { gate: 'check-guard', mode: 'enforce', ticketKey: '#3', reason: 'package.json scripts.test changed' },
    ]);
  });
});

describe('the check guard on a remote completion', () => {
  const config = parseVerificationConfig(
    JSON.stringify({ v: 1, checks: { test: { run: ['npm', 'test'] } }, run: ['test'] }),
  ).config;
  const git: GitEvidence = {
    v: 1,
    base: { head: 'a'.repeat(40), branch: 'main' },
    tree: { toplevel: 'runner:cloud', head: 'b'.repeat(40), branch: 'feat', fingerprint: 'runner' },
    changed: [{ path: 'package.json', add: 1, del: 1 }],
    stats: { files: 1, add: 1, del: 1 },
    flags: [],
  };
  const runner = (files: Record<string, string>): CheckRunner => ({
    name: 'cloud',
    run: async () => ({ checks: [] }),
    read: async ({ commit, path: p }) => files[`${commit[0]}:${p}`] ?? null,
  });
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'teamtrail-remote-'));

  it('reads both sides through the runner', async () => {
    const pkg = (test: string) => JSON.stringify({ scripts: { test } });
    const changed = runner({ 'a:package.json': pkg('vitest run'), 'b:package.json': pkg('true') });
    const g = await runnerGuard({ config, checks: ['test'], git, runner: changed, repoRoot });
    expect(g?.findings.map((f) => f.text)).toEqual(['package.json scripts.test changed']);
    const same = runner({ 'a:package.json': pkg('vitest run'), 'b:package.json': pkg('vitest run') });
    expect(await runnerGuard({ config, checks: ['test'], git, runner: same, repoRoot })).toBeUndefined();
  });

  it("can't say a file it can't read changed nothing", async () => {
    const blind: CheckRunner = { name: 'cloud', run: async () => ({ checks: [] }) };
    const g = await runnerGuard({ config, checks: ['test'], git, runner: blind, repoRoot });
    expect(g?.findings.map((f) => f.kind)).toEqual(['unread']);
  });
});
