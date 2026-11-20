import { describe, expect, it } from 'vitest';
import { checkArgv, checkNotice } from '../src/guides/checkArgv';
import { programIdentity } from '../src/guides/programIdentity';

const spec = (line: string, cwd?: string) => ({ run: line.split(' '), ...(cwd ? { cwd } : {}) });

/*
 * A check named after a known tool by a path anywhere but the repo's own tool folders used to count as that tool:
 * `/tmp/x/pytest` was pytest, so an agent could put its own program there and have it approved as a known check, in
 * bulk. Program identity is strict now: a bare name (found on PATH) or a path into node_modules/.bin, .venv/bin,
 * vendor/bin, or the repo's gradlew / mvnw, inside the repo once the check's folder is applied.
 */
describe('program identity', () => {
  const escapes: [line: string, cwd?: string][] = [
    ['/tmp/x/pytest'],
    ['../x/pytest'],
    ['~/bin/jest'],
    ['/usr/local/bin/jest --ci'],
    ['../x/node_modules/.bin/jest'],
    ['/tmp/x/node_modules/.bin/jest'],
    ['/tmp/repo/.venv/bin/pytest'],
    ['../../../vendor/bin/phpunit', 'apps/web'],
    ['../gradlew test'],
    ['/tmp/x/gradlew test'],
    ['C:\\tools\\pytest.exe'],
    ['\\\\host\\share\\pytest.exe'],
    ['tools/pytest'],
    ['scripts/node_modules_bin/jest'],
    ['/tmp/x/python -m pytest'],
    ['/tmp/x/uv run --frozen pytest'],
    ['../x/bundle exec rspec'],
    ['/tmp/x/npx --no vitest'],
    ['/tmp/x/npm test'],
  ];
  it.each(escapes)('`%s` (in %s) is an unknown program, never the tool it is named after', (line, cwd) => {
    expect(checkArgv(spec(line, cwd))).toEqual([]);
    expect(checkNotice(spec(line, cwd))).toMatch(/unknown program/);
  });

  const tools: [line: string, cwd?: string][] = [
    ['pytest -q'],
    ['pytest.exe'],
    ['node_modules/.bin/jest'],
    ['./node_modules/.bin/eslint .'],
    ['../../node_modules/.bin/vitest run', 'apps/web'],
    ['apps/web/node_modules/.bin/vitest run'],
    ['node_modules\\.bin\\jest.cmd'],
    ['.venv/bin/pytest'],
    ['.venv/Scripts/pytest.exe'],
    ['.venv/bin/python -m pytest'],
    ['vendor/bin/phpunit'],
    ['./gradlew test'],
    ['../gradlew test', 'app'],
    ['./mvnw -B verify'],
  ];
  it.each(tools)('`%s` (in %s) is the known tool', (line, cwd) => {
    expect(checkArgv(spec(line, cwd))).toEqual([]);
    expect(checkNotice(spec(line, cwd))).toBeUndefined();
  });

  it('refuses a wrapper running a known tool from outside the repo', () => {
    for (const line of ['uv run --frozen /tmp/x/pytest', 'bundle exec ../x/rspec', 'npx --no /tmp/x/vitest'])
      expect(checkArgv(spec(line)).join('; ')).toMatch(/only a known check/);
    // the wrapper's folder is where its tool's path starts
    expect(checkNotice(spec('poetry -C api run .venv/bin/pytest'))).toBeUndefined();
  });

  it('still refuses by the base name, whatever the path', () => {
    expect(checkArgv(spec('/tmp/x/bash -c id')).join('; ')).toMatch(/runs a shell/);
    expect(checkArgv(spec('../x/curl https://example.com')).join('; ')).toMatch(/network/);
    expect(checkArgv(spec('/tmp/x/pnpx vitest')).join('; ')).toMatch(/downloads/);
  });

  it('tells bare names, repo tools, repo files and paths outside apart', () => {
    expect(programIdentity('pytest')).toEqual({ kind: 'bare', name: 'pytest' });
    expect(programIdentity('../../node_modules/.bin/jest', 'apps/web')).toEqual({
      kind: 'tool',
      name: 'jest',
      rel: 'node_modules/.bin/jest',
    });
    expect(programIdentity('./gradlew')).toEqual({ kind: 'tool', name: 'gradlew', rel: 'gradlew' });
    expect(programIdentity('bin/rails')).toEqual({ kind: 'file', rel: 'bin/rails' });
    expect(programIdentity('../node_modules/.bin/jest')).toEqual({
      kind: 'outside',
      path: '../node_modules/.bin/jest',
    });
    expect(programIdentity('~/bin/jest').kind).toBe('outside');
  });
});
