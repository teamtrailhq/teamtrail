import { describe, expect, it } from 'vitest';
import type { CheckFinding } from '../src/model/checkScreening';
import { repoPath } from '../src/verification/repoPath';
import { screenChecks } from '../src/verification/screenChecks';
import { memoryRepoFiles } from './fakes/memoryRepoFiles';

const pkg = (o: { scripts?: Record<string, string>; devDependencies?: Record<string, string> }) => JSON.stringify(o);

const REPO = memoryRepoFiles({
  'package.json': pkg({
    scripts: { test: 'vitest', lint: 'eslint .' },
    devDependencies: { vitest: '1', typescript: '5' },
  }),
  'packages/api/package.json': pkg({ scripts: { build: 'tsc' } }),
  'svc/go.mod': 'module x',
  'svc/inner/main.go': 'package main',
  'rs/Cargo.toml': '[package]',
  Makefile: 'include extra.mk\n.PHONY: test\ntest lint: deps\n\tgo test\n',
  'tools/Makefile': 'build:\n\techo\n',
  'scripts/check.sh': '#!/bin/sh',
  'py/pyproject.toml': '[tool.pytest]',
});

async function screen(run: string, cwd?: string): Promise<Omit<CheckFinding, 'check'>[]> {
  const found = await screenChecks({ checks: [{ name: 'c', run: run.split(' '), cwd }], files: REPO });
  return found.map(({ severity, text }) => ({ severity, text }));
}

describe('screenChecks', () => {
  it('reads package.json scripts for npm, pnpm and yarn', async () => {
    expect(await screen('npm test')).toEqual([]);
    expect(await screen('npm run lint -- --fix')).toEqual([]);
    expect(await screen('npm run typecheck')).toEqual([
      { severity: 'wont-run', text: 'No `typecheck` script in package.json' },
    ]);
    expect(await screen('npm test', 'packages/api')).toEqual([
      { severity: 'wont-run', text: 'No `test` script in package.json in `packages/api`' },
    ]);
    expect(await screen('npm test', 'svc')).toEqual([{ severity: 'wont-run', text: 'No package.json in `svc`' }]);
    expect(await screen('pnpm run e2e')).toEqual([{ severity: 'wont-run', text: 'No `e2e` script in package.json' }]);
    expect((await screen('pnpm e2e'))[0].severity).toBe('unsure');
    expect((await screen('yarn e2e'))[0].severity).toBe('unsure');
    expect(await screen('pnpm install')).toEqual([]);
    expect(await screen('npm --workspace x run nope')).toEqual([]);
    expect(await screen('npm web:asdasd')).toEqual([{ severity: 'wont-run', text: 'npm has no `web:asdasd` command' }]);
    expect(await screen('npm lint')).toEqual([
      { severity: 'wont-run', text: 'npm has no `lint` command; the script runs with `npm run lint`' },
    ]);
    expect(await screen('npm ci')).toEqual([]);
    expect(await screen('npm audit --omit dev')).toEqual([]);
  });

  it('looks for a tool among the dependencies', async () => {
    expect(await screen('npx vitest run')).toEqual([]);
    expect(await screen('npx tsc --noEmit')).toEqual([]);
    expect(await screen('npx --yes vitest', 'packages/api')).toEqual([]);
    expect(await screen('npx jest')).toEqual([
      { severity: 'unsure', text: "`jest` isn't a dependency in package.json" },
    ]);
    expect(await screen('pnpm exec jest')).toEqual([
      { severity: 'unsure', text: "`jest` isn't a dependency in package.json" },
    ]);
    expect(await screen('npx -p jest jest')).toEqual([]);
  });

  it('looks for go.mod, Cargo.toml and pytest settings in the folder or above', async () => {
    expect(await screen('go test ./...', 'svc/inner')).toEqual([]);
    expect(await screen('go test ./...')).toEqual([{ severity: 'wont-run', text: 'No go.mod' }]);
    expect(await screen('cargo test', 'rs')).toEqual([]);
    expect(await screen('cargo test', 'svc')).toEqual([
      { severity: 'wont-run', text: 'No Cargo.toml in `svc` or above it' },
    ]);
    expect(await screen('pytest -q', 'py')).toEqual([]);
    expect((await screen('python -m pytest'))[0].severity).toBe('unsure');
  });

  it('reads makefile targets', async () => {
    expect(await screen('make test')).toEqual([]);
    expect(await screen('make lint')).toEqual([]);
    expect((await screen('make e2e'))[0]).toEqual({
      severity: 'unsure',
      text: 'No `e2e` target in Makefile; it may come from an included file',
    });
    expect(await screen('make -C tools test')).toEqual([
      { severity: 'wont-run', text: 'No `test` target in Makefile in `tools`' },
    ]);
    expect(await screen('make test', 'py')).toEqual([{ severity: 'wont-run', text: 'No Makefile in `py`' }]);
  });

  it('looks for the files commands run, and the folder', async () => {
    expect(await screen('./scripts/check.sh')).toEqual([]);
    expect(await screen('bash scripts/check.sh')).toEqual([]);
    expect(await screen('node scripts/missing.mjs')).toEqual([
      { severity: 'wont-run', text: 'No `scripts/missing.mjs`' },
    ]);
    expect(await screen('node --test')).toEqual([]);
    expect(await screen('npm test', 'nowhere')).toEqual([{ severity: 'wont-run', text: 'No folder `nowhere`' }]);
    expect((await screen('npm test', '../out'))[0].severity).toBe('wont-run');
  });

  it('says nothing about programs it does not know, and names each finding for its check', async () => {
    expect(await screen('ruff check .')).toEqual([]);
    const found = await screenChecks({
      checks: [
        { name: 'test', run: ['npm', 'test'] },
        { name: 'e2e', run: ['npm', 'run', 'e2e'] },
      ],
      files: REPO,
    });
    expect(found.map((f) => f.check)).toEqual(['e2e']);
  });

  it('keeps every path inside the repo', () => {
    expect(repoPath('a/b', '../c')).toBe('a/c');
    expect(repoPath('a', '../../x')).toBeUndefined();
    expect(repoPath('/etc/passwd')).toBeUndefined();
    expect(repoPath('', './package.json')).toBe('package.json');
  });
});
