import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { git } from '../src/evidence/git';
import { findWorktree, readTreeState, type Worktree } from '../src/evidence/treeState';
import { childEnv } from '../src/lib/childEnv';
import type { CheckSpec } from '../src/model/verification';
import { checkEnv } from '../src/verification/checkEnv';
import { runCheck } from '../src/verification/runCheck';

/*
 * What a check command and git get to see of the environment Teamtrail runs in. The audit found that only
 * GitHub, Linear, TEAMTRAIL_ and SLACK_ names were removed, so NPM_TOKEN, AWS_*, ANTHROPIC_API_KEY and the
 * rest reached every check, and that git got everything, GITHUB_TOKEN included, in worktrees agents control.
 */
const SECRETS = {
  NPM_TOKEN: 'npm_x',
  NODE_AUTH_TOKEN: 'x',
  AWS_ACCESS_KEY_ID: 'AKIA',
  AWS_SECRET_ACCESS_KEY: 'x',
  AWS_PROFILE: 'prod',
  ANTHROPIC_API_KEY: 'sk-ant',
  OPENAI_API_KEY: 'sk-x',
  GOOGLE_APPLICATION_CREDENTIALS: '/k.json',
  AZURE_CLIENT_SECRET: 'x',
  GITHUB_TOKEN: 'ghp_x',
  GH_TOKEN: 'x',
  GH_HOST: 'ghe.example',
  LINEAR_API_KEY: 'x',
  SLACK_BOT_TOKEN: 'x',
  TEAMTRAIL_TOKEN: 'tt_x',
  DATABASE_URL: 'postgres://u:p@h/db',
  STRIPE_SECRET_KEY: 'x',
  MY_PASSWORD: 'x',
  SSH_AUTH_SOCK: '/tmp/agent.sock',
  npm_config__authToken: 'x',
  'npm_config_//registry.npmjs.org/:_authToken': 'x',
  NPM_CONFIG__AUTH: 'x',
  NODE_SECRET: 'x',
  XDG_SECRET_KEY: 'x',
  GIT_SSH_COMMAND: 'evil',
  SOMETHING_ELSE: 'x',
};
const BASICS = {
  PATH: process.env.PATH,
  HOME: '/home/ada',
  LANG: 'en_US.UTF-8',
  LC_ALL: 'C',
  TERM: 'xterm',
  TMPDIR: '/tmp',
  CI: 'true',
  NODE_ENV: 'test',
  NODE_OPTIONS: '--max-old-space-size=4096',
  npm_config_registry: 'https://registry.example',
  NPM_CONFIG_CACHE: '/c',
  CHROME: '/chrome',
  XDG_CONFIG_HOME: '/x',
  JAVA_HOME: '/j',
  SystemRoot: 'C:\\Windows',
  HTTPS_PROXY: 'http://proxy',
};

test('checks get an allowlisted environment: basics and build tooling pass, everything else stays behind', () => {
  const { env, withheld } = childEnv({ ...BASICS, ...SECRETS });
  assert.deepEqual(env, BASICS);
  assert.deepEqual(withheld.sort(), Object.keys(SECRETS).sort());
});

test('names the person lists in TEAMTRAIL_CHECK_ENV pass; a pattern never passes a secret-shaped name', () => {
  const source = {
    ...BASICS,
    ...SECRETS,
    APP_MODE: 'x',
    APP_API_KEY: 'k',
    TEAMTRAIL_CHECK_ENV: 'DATABASE_URL, APP_* STRIPE_SECRET_KEY AWS_* GITHUB_TOKEN TEAMTRAIL_TOKEN SLACK_*',
  };
  const { env } = checkEnv(source);
  // exact names are the person's own decision, secret-shaped or not
  assert.equal(env.DATABASE_URL, SECRETS.DATABASE_URL);
  assert.equal(env.STRIPE_SECRET_KEY, 'x');
  assert.equal(env.APP_MODE, 'x');
  // a pattern passes what it matches, minus anything that looks like a secret or a cloud credential
  assert.equal(env.APP_API_KEY, undefined);
  assert.equal(env.AWS_PROFILE, undefined);
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  // Teamtrail's own credentials never pass, listed or not
  for (const name of [
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'TEAMTRAIL_TOKEN',
    'SLACK_BOT_TOKEN',
    'TEAMTRAIL_CHECK_ENV',
    'LINEAR_API_KEY',
  ])
    assert.equal(env[name], undefined, name);
});

test('a check command sees none of the secrets, and a failed check says what was held back', async () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-env-'));
  const run = {
    repoRoot,
    logDir: path.join(repoRoot, '.teamtrail', 'logs'),
    logRel: 'logs',
    env: { ...process.env, ...SECRETS },
  };
  const print = `const seen = ${JSON.stringify(Object.keys(SECRETS))}.filter((k) => process.env[k] !== undefined); console.log('seen:' + seen.join(','));`;
  const spec = (code: string): CheckSpec => ({ run: [process.execPath, '-e', code], timeoutSec: 30 });
  const ok = await runCheck('env', spec(print), run);
  assert.equal(ok.tail, 'seen:');
  assert.doesNotMatch(readFileSync(path.join(run.logDir, 'env.log'), 'utf8'), /not passed/);
  const failed = await runCheck('needs', spec(`${print} process.exit(1)`), run);
  assert.equal(failed.tail, 'seen:');
  const log = readFileSync(path.join(run.logDir, 'needs.log'), 'utf8');
  assert.match(log, /environment variables were not passed to this check: .*DATABASE_URL.*TEAMTRAIL_CHECK_ENV/s);
  assert.doesNotMatch(log, /postgres:|sk-ant|ghp_x/);
});

function repoWithTraps() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-gitsafe-')));
  const sh = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  const marker = path.join(dir, '..', `${path.basename(dir)}.ran`);
  const trap = path.join(dir, '..', `${path.basename(dir)}.sh`);
  writeFileSync(
    trap,
    `#!/bin/sh\necho "$0 $* (parent: $(ps -o args= -p $PPID)) GITHUB_TOKEN=$GITHUB_TOKEN" >> "${marker}"\ncat\n`,
  );
  chmodSync(trap, 0o755);
  sh('init', '-q');
  writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  sh('add', '.');
  sh('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'init');
  // What an agent can write into the repo it works in: every one of these runs a command of its choosing.
  sh('config', 'core.fsmonitor', trap);
  sh('config', 'core.pager', trap);
  sh('config', 'core.sshCommand', trap);
  sh('config', 'credential.helper', `!${trap}`);
  sh('config', 'diff.external', trap);
  sh('config', 'filter.evil.clean', trap);
  sh('config', 'filter.evil.smudge', trap);
  sh('config', 'diff.evil.textconv', trap);
  writeFileSync(path.join(dir, '.git', 'hooks', 'post-checkout'), `#!/bin/sh\n"${trap}" < /dev/null\n`);
  chmodSync(path.join(dir, '.git', 'hooks', 'post-checkout'), 0o755);
  writeFileSync(path.join(dir, '.gitattributes'), '*.txt filter=evil diff=evil\n');
  writeFileSync(path.join(dir, 'a.txt'), 'a\nb\n');
  return { dir, marker };
}

test(
  "git runs nothing a repo's local config names, and never sees a token",
  { skip: process.platform === 'win32' },
  async () => {
    const { dir, marker } = repoWithTraps();
    const before = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND };
    process.env.GITHUB_TOKEN = 'ghp_parent';
    try {
      const state = await readTreeState((await findWorktree(dir)) as Worktree);
      assert.ok(state.head);
      assert.equal((await git(dir, ['status', '--porcelain'])).code, 0);
      assert.equal((await git(dir, ['diff', 'HEAD'])).code, 0);
      const added = await git(dir, ['worktree', 'add', '-q', '-b', 'side', '--end-of-options', `${dir}-side`]);
      assert.equal(added.code, 0, added.stderr);
      const env = await git(dir, ['-c', 'alias.env=!env', 'env']);
      assert.doesNotMatch(env.stdout.toString(), /ghp_parent|GITHUB_TOKEN/);
      assert.match(env.stdout.toString(), /GIT_TERMINAL_PROMPT=0/);
    } finally {
      if (before.GITHUB_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = before.GITHUB_TOKEN;
    }
    assert.equal(existsSync(marker), false, existsSync(marker) ? readFileSync(marker, 'utf8') : '');
  },
);

test('PASS-shaped names stay behind, and proxies pass without the credentials in their URL', () => {
  const { env, withheld } = childEnv({
    PATH: '/bin',
    DB_PASS: 'x',
    SMTP_PASS: 'x',
    PASS_PHRASE: 'x',
    MY_PASSWD_FILE: 'x',
    HTTPS_PROXY: 'http://ada:s3cret@proxy.example:3128',
    http_proxy: 'http://user@proxy.example:8080/',
    ALL_PROXY: 'socks5://proxy.example:1080',
    NO_PROXY: 'localhost',
  });
  assert.deepEqual(withheld.sort(), ['DB_PASS', 'MY_PASSWD_FILE', 'PASS_PHRASE', 'SMTP_PASS']);
  assert.equal(env.HTTPS_PROXY, 'http://proxy.example:3128');
  assert.equal(env.http_proxy, 'http://proxy.example:8080/');
  assert.equal(env.ALL_PROXY, 'socks5://proxy.example:1080');
  assert.equal(env.NO_PROXY, 'localhost');
  // A proxy value that isn't a URL is passed as it is: there's nothing to strip.
  assert.equal(childEnv({ HTTP_PROXY: 'proxy.example:3128' }).env.HTTP_PROXY, 'proxy.example:3128');
});

test('proxy credentials are stripped with or without a scheme, whatever the password holds', () => {
  const proxy = (v: string) => childEnv({ HTTPS_PROXY: v }).env.HTTPS_PROXY;
  assert.equal(proxy('user:pw@proxy.example:8080'), 'proxy.example:8080');
  assert.equal(proxy('http://user:p/a?s#s@proxy.example:8080/'), 'http://proxy.example:8080/');
  assert.equal(proxy('http://us@er:p@ss@proxy.example:8080'), 'http://proxy.example:8080');
  assert.equal(proxy('p/w@proxy.example:8080'), 'proxy.example:8080');
  assert.equal(proxy('http://proxy.example:8080'), 'http://proxy.example:8080');
  assert.equal(proxy('proxy.example:8080'), 'proxy.example:8080');
});
