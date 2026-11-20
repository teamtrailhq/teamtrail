import { describe, expect, it } from 'vitest';
import { childEnv } from '../src/lib/childEnv';
import { envNamePasses } from '../src/lib/envNamePasses';
import { detectRepoProfile } from '../src/repoProfile';
import { checkEnvNameProblem } from '../src/verification/checkEnvNameProblem';
import { checkVariables } from '../src/verification/checkVariables';
import { profileRepoFiles } from './fakes/profileRepoFiles';

const SOURCE = {
  PATH: '/usr/bin',
  DATABASE_URL: 'postgres://fake-user:fake-password@db/shop',
  STRIPE_SECRET_KEY: 'fake-stripe-test-value',
  TEAMTRAIL_CHECK_ENV: 'REDIS_URL, APP_*',
  LOG_LEVEL: '',
};

describe('variables checks can read', () => {
  it('lists the names checks may read and the ones the repo’s tests reference, never a value', async () => {
    const profile = await detectRepoProfile(profileRepoFiles('node-npm-workspaces'));
    const view = checkVariables({ source: SOURCE, added: ['DATABASE_URL'], profile });
    expect(view.fromShell).toEqual(['REDIS_URL', 'APP_*']);
    expect(view.added).toEqual(['DATABASE_URL']);
    expect(view.allowlist.names).toContain('PATH');
    expect(view.allowlist.prefixes).toContain('NODE_');
    const byName = Object.fromEntries(view.needed.map((v) => [v.name, v]));
    expect(byName.DATABASE_URL).toMatchObject({ passes: true, set: true, secretShaped: false });
    expect(byName.STRIPE_SECRET_KEY).toMatchObject({ passes: false, set: true, secretShaped: true });
    // an empty value counts as not set: the test would get nothing
    expect(byName.LOG_LEVEL).toMatchObject({ passes: false, set: false });
    const text = JSON.stringify(view);
    for (const value of ['fake-password', 'fake-stripe-test-value', 'postgres://']) expect(text).not.toContain(value);
  });

  it('has nothing to say about the repo without its profile', () => {
    expect(checkVariables({ source: {}, added: [] }).needed).toEqual([]);
  });

  it('agrees with what a check is given', () => {
    const extra = ['DATABASE_URL', 'APP_*'];
    const { env } = childEnv({ DATABASE_URL: 'x', APP_MODE: 'test', APP_TOKEN: 'x', GITHUB_TOKEN: 'x' }, extra);
    for (const name of ['DATABASE_URL', 'APP_MODE', 'APP_TOKEN', 'GITHUB_TOKEN'])
      expect(envNamePasses(name, extra)).toBe(name in env);
  });

  it('passes the toolchain locations it now knows, a Go proxy without its user and password', () => {
    const { env } = childEnv({
      GOPROXY: 'https://fake-user:fake-pw@proxy.example,direct',
      GRADLE_USER_HOME: '/g',
      UV_CACHE_DIR: '/u',
      UV_INDEX_URL: 'https://fake-user:fake-pw@pypi.example/simple',
      GRADLE_OPTS: '-Dpassword=x',
    });
    expect(env).toEqual({ GOPROXY: 'https://proxy.example,direct', GRADLE_USER_HOME: '/g', UV_CACHE_DIR: '/u' });
  });

  it('takes variable names and PREFIX_* patterns, never Teamtrail’s own', () => {
    for (const ok of ['DATABASE_URL', 'redis_url', '_X', 'APP_*']) expect(checkEnvNameProblem(ok)).toBeUndefined();
    for (const bad of ['', 'A B', 'X=1', '1X', '*', 'A*', 'PATH;rm', 'A'.repeat(101)])
      expect(checkEnvNameProblem(bad)).toMatch(/isn't a variable name/);
    for (const own of ['GITHUB_TOKEN', 'TEAMTRAIL_ANY', 'SLACK_BOT_TOKEN', 'LINEAR_API_KEY'])
      expect(checkEnvNameProblem(own)).toMatch(/Teamtrail's own/);
  });
});
