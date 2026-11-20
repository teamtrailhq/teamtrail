import { describe, expect, it } from 'vitest';
import type { VerificationAttempt } from '../src/model/verification';
import { buildProof, proofMarkdown } from '../src/node';
import { detectRepoProfile, suggestChecks } from '../src/repoProfile';
import { checksDiff } from '../src/verification/checksDiff';
import { parseVerificationConfig } from '../src/verification/config';
import { pathScope } from '../src/verification/pathScope';
import { sharedFile } from '../src/verification/sharedFile';
import { profileRepoFiles } from './fakes/profileRepoFiles';

const CONFIG = {
  v: 1,
  checks: {
    'web-test': { run: ['npm', 'test'], cwd: 'apps/web', paths: ['apps/web/**', 'packages/ui/**'] },
    'api-test': { run: ['uv', 'run', '--frozen', 'pytest'], cwd: 'services/api', paths: ['services/api/**'] },
    lint: { run: ['npm', 'run', 'lint'] },
  },
  run: ['web-test', 'api-test', 'lint'],
};
const config = parseVerificationConfig(JSON.stringify(CONFIG)).config!;
const scope = (changed: string[], over: { keep?: string[]; prefix?: string } = {}) =>
  pathScope({ config, checks: config.run, changed, ...over });

describe("a check's paths in verification.json", () => {
  const parse = (paths: unknown) =>
    parseVerificationConfig(JSON.stringify({ v: 1, checks: { test: { run: ['npm', 'test'], paths } } }));
  it('takes repo-relative globs and refuses paths out of the repo', () => {
    expect(parse(['apps/web/**', 'packages/ui']).config?.checks.test.paths).toEqual(['apps/web/**', 'packages/ui']);
    expect(parse(['../other/**']).errors).toEqual(['checks.test.paths must list up to 50 repo-relative path globs']);
    expect(parse(['/etc/**']).errors).toHaveLength(1);
    expect(parse('apps/web').errors).toHaveLength(1);
    expect(parse([]).config?.checks.test.paths, 'none is every change').toBeUndefined();
  });

  it('shows in what approving the file would change', () => {
    const before = JSON.stringify({ ...CONFIG, checks: { ...CONFIG.checks, 'web-test': { run: ['npm', 'test'] } } });
    const { lines } = checksDiff(before, JSON.stringify(CONFIG));
    expect(lines).toContain(
      'web-test: ["npm","test"] → ["npm","test"] in apps/web, only for changes in apps/web/**, packages/ui/**',
    );
  });
});

describe('which checks a change runs', () => {
  it('leaves out a check whose paths no changed file is in, with the reason', () => {
    const s = scope(['services/api/app.py', 'services/api/tests/test_app.py']);
    expect(s.run).toEqual(['api-test', 'lint']);
    expect(s.outOfScope).toEqual([
      {
        name: 'web-test',
        argv: ['npm', 'test'],
        paths: ['apps/web/**', 'packages/ui/**'],
        reason: 'changes outside apps/web, packages/ui',
      },
    ]);
    expect(scope(['packages/ui/button.ts']).run, 'a package it depends on counts').toEqual(['web-test', 'lint']);
  });

  it('runs everything for shared files: lockfiles anywhere, top manifests and config, CI', () => {
    for (const f of [
      'package-lock.json',
      'apps/web/package-lock.json',
      'services/api/uv.lock',
      'package.json',
      'tsconfig.base.json',
      'pnpm-workspace.yaml',
      '.github/workflows/ci.yml',
      '.nvmrc',
    ]) {
      expect(sharedFile(f), f).toBe(true);
      expect(scope(['services/api/app.py', f]).run, f).toEqual(config.run);
    }
    expect(sharedFile('apps/web/package.json')).toBe(false);
  });

  it('runs everything when a changed file is in no check’s paths, or nothing changed', () => {
    expect(scope(['README.md']).everything).toBe('README.md');
    expect(scope(['services/api/app.py', 'docs/guide.md']).run).toEqual(config.run);
    expect(scope([]).run).toEqual(config.run);
  });

  it('keeps a check named as evidence, and checks outside the tracked folder', () => {
    expect(scope(['services/api/app.py'], { keep: ['web-test'] }).run).toEqual(config.run);
    // the checks' folder sits under `sub/` in the git worktree: paths are relative to it
    expect(scope(['sub/services/api/app.py'], { prefix: 'sub' }).run).toEqual(['api-test', 'lint']);
    expect(scope(['sub/services/api/app.py', 'other/x.py'], { prefix: 'sub' }).run).toEqual(config.run);
  });

  it('a config without paths runs every check, as before', () => {
    const plain = parseVerificationConfig(
      JSON.stringify({ v: 1, checks: { t: { run: ['npm', 'test'] } }, run: ['t'] }),
    );
    expect(pathScope({ config: plain.config, checks: ['t'], changed: ['a.ts'] }).run).toEqual(['t']);
  });
});

describe('the proof of a change outside a check’s paths', () => {
  const attempt: VerificationAttempt = {
    v: 1,
    id: 'A-1',
    mapId: 'm',
    ticketId: '3',
    ticketKey: '#3',
    agent: 'claude-01',
    level: 'checks',
    configHash: 'h',
    submittedAt: 1,
    finishedAt: 2,
    resolution: 'api fix',
    checks: [],
    outOfScope: scope(['services/api/app.py']).outOfScope,
    result: 'pass',
  };
  const ticket = { mapId: 'm', id: '3', key: '#3', title: 'Fix', type: 'execute' };

  it('says which check was skipped and why, and stays verified', () => {
    const proof = buildProof({ ticket, trail: 'T', attempts: [attempt], verdicts: [], decisions: [] });
    expect(proof.status).toBe('verified');
    expect(proof.outOfScope).toEqual([
      { name: 'web-test', argv: ['npm', 'test'], reason: 'changes outside apps/web, packages/ui' },
    ]);
    const text = proofMarkdown(proof);
    expect(text).toContain('- ⏭️ web\\-test (`npm test`) skipped: changes outside apps/web, packages/ui');
    expect(text).not.toContain('No checks ran.');
  });

  it('an attempt without it reads as before', () => {
    const { outOfScope: _gone, ...old } = attempt;
    const proof = buildProof({ ticket, trail: 'T', attempts: [old], verdicts: [], decisions: [] });
    expect('outOfScope' in proof).toBe(false);
  });
});

describe('suggested checks in a monorepo', () => {
  it('a workspace member’s checks are scoped to its folder; the top’s are not', async () => {
    const p = await detectRepoProfile(profileRepoFiles('node-npm-workspaces'));
    const byCwd = Object.fromEntries(suggestChecks(p).map((s) => [`${s.name} in ${s.cwd || '.'}`, s.paths]));
    expect(byCwd['web-test in apps/web']).toEqual(['apps/web/**']);
    expect(
      Object.entries(byCwd)
        .filter(([k]) => k.endsWith(' in .'))
        .every(([, v]) => v === undefined),
    ).toBe(true);
    const single = await detectRepoProfile(profileRepoFiles('python-uv'));
    expect(suggestChecks(single).every((s) => !s.paths)).toBe(true);
  });
});
