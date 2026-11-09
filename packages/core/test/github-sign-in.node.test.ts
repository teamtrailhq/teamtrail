import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { githubClientId } from '../src/adapters/remote/github';
import type { GitHubSignInPoll, GitHubSignInStart } from '../src/adapters/remote/signInTypes';
import type { TrackerSettings } from '../src/adapters/remote/types';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { githubSignIn } from '../src/server/githubSignIn';
import { resolveGitHubToken } from '../src/server/trackerConfig';
import { trackerContext } from '../src/server/trackerContext';
import { fakeGitHub } from './fakes/github';
import { fakeGitHubDevice } from './fakes/githubDevice';

const CLIENT = 'Iv1.fake_client_id';
const TOKEN = 'gho_signed_in_secret_9b1c';
const WEB = 'https://github.example';
const noGh = async (cmd: string) => {
  if (cmd === 'git') return 'git@github.com:octo-org/launchpad.git';
  throw new Error('gh: not logged in');
};

function setup(device: ReturnType<typeof fakeGitHubDevice>) {
  const gh = fakeGitHub({ login: 'octo-dev', token: TOKEN });
  const fetch = ((input: string, init: RequestInit) =>
    device.handles(new URL(input).pathname)
      ? device.fetch(input, init)
      : gh.fetch(input, init)) as typeof globalThis.fetch;
  return fetch;
}

test('client id: the env override, else the constant (empty until the OAuth app is registered)', () => {
  assert.equal(githubClientId({ TEAMTRAIL_GITHUB_CLIENT_ID: ' Iv1.abc ' }), 'Iv1.abc');
  assert.equal(githubClientId({}), undefined);
});

test('token order: pasted, env, signed in, then gh', async () => {
  const gh = async () => 'from-gh';
  const signed = { githubSignIn: { token: 'o', at: '' } };
  assert.equal((await resolveGitHubToken({ ...signed, github: { token: 's' } }, {}, gh))?.source, 'stored');
  assert.equal((await resolveGitHubToken(signed, { GITHUB_TOKEN: 'e' }, gh))?.source, 'GITHUB_TOKEN');
  assert.equal((await resolveGitHubToken(signed, { GH_TOKEN: 'g' }, gh))?.source, 'GH_TOKEN');
  assert.deepEqual(await resolveGitHubToken(signed, {}, gh), { token: 'o', source: 'signed-in' });
  assert.equal((await resolveGitHubToken({}, {}, gh))?.source, 'gh');
});

test('device flow: waits, respects interval and slow_down, and saves the token 0600', async () => {
  const device = fakeGitHubDevice({ clientId: CLIENT, token: TOKEN, interval: 5, slowDownFirst: 1 });
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-signin-'));
  const configDir = path.join(tmp, 'config');
  const env = { TEAMTRAIL_GITHUB_CLIENT_ID: CLIENT, TEAMTRAIL_GITHUB_WEB: WEB };
  const ctx = trackerContext({
    root: tmp,
    markdown: new MemoryAdapter(),
    env,
    exec: noGh,
    fetch: setup(device),
    configDir,
  });
  let clock = 1_000_000;
  let changed = 0;
  const s = githubSignIn({ ctx, changed: () => changed++, now: () => clock });
  const asked = () => device.requests.filter((r) => r.path === '/login/oauth/access_token').length;

  const start = await s.start();
  assert.equal(start.kind, 'code');
  assert.equal(start.kind === 'code' && start.userCode, device.userCode);
  assert.equal(start.kind === 'code' && start.verificationUri, `${WEB}/login/device`);
  assert.ok(!JSON.stringify(start).includes('dc_'), 'the device code stays in the process');
  assert.equal(device.requests[0].params.scope, 'repo');

  assert.deepEqual(await s.poll(), { kind: 'waiting', interval: 5 });
  assert.equal(asked(), 0, 'not before the interval');
  clock += 5000;
  assert.deepEqual(await s.poll(), { kind: 'waiting', interval: 10 }, 'slow_down adds 5 s');
  clock += 5000;
  await s.poll();
  assert.equal(asked(), 1, 'the slower interval holds');
  clock += 5000;
  assert.deepEqual(await s.poll(), { kind: 'waiting', interval: 10 });
  assert.equal(asked(), 2);

  device.approve();
  clock += 10_000;
  const done = await s.poll();
  assert.deepEqual(done, { kind: 'signed-in', account: { kind: 'user', login: 'octo-dev' } });
  assert.equal(changed, 1);
  const file = path.join(configDir, 'credentials.json');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).githubSignIn.token, TOKEN);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal((await ctx.githubToken())?.source, 'signed-in');
  assert.deepEqual(await s.poll(), { kind: 'none' }, 'the flow is over');

  s.signOut();
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).githubSignIn, undefined);
  assert.equal(s.signedIn(), false);
});

test('device flow: denied and expired codes end the flow', async () => {
  const device = fakeGitHubDevice({ clientId: CLIENT, token: TOKEN });
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-signin-'));
  const env = { TEAMTRAIL_GITHUB_CLIENT_ID: CLIENT, TEAMTRAIL_GITHUB_WEB: WEB };
  const ctx = trackerContext({ root: tmp, markdown: new MemoryAdapter(), env, exec: noGh, fetch: setup(device) });
  let clock = 0;
  const s = githubSignIn({ ctx, changed: () => {}, now: () => clock });
  await s.start();
  device.deny();
  assert.deepEqual(await s.poll(), { kind: 'denied' });
  assert.deepEqual(await s.poll(), { kind: 'none' });
  await s.start();
  device.expire();
  assert.deepEqual(await s.poll(), { kind: 'expired' });
  await s.start();
  clock += 901_000;
  assert.deepEqual(await s.poll(), { kind: 'expired' }, 'expired by the clock without asking GitHub');
});

let server: http.Server;
let bridge: TrackerBridge;
let base: string;
const texts: string[] = [];
const device = fakeGitHubDevice({ clientId: CLIENT, token: TOKEN });

before(async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-signin-bridge-'));
  const trackerDir = path.join(tmp, 'repo', '.teamtrail');
  bridge = createTrackerBridge(trackerDir, {
    env: { TEAMTRAIL_GITHUB_CLIENT_ID: CLIENT, TEAMTRAIL_GITHUB_WEB: WEB },
    exec: noGh,
    fetch: setup(device),
    configDir: path.join(tmp, 'config'),
    cwd: path.dirname(trackerDir),
  });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  bridge.close();
  server.close();
});

const call = async <T>(method: string, p: string) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' } });
  const text = await r.text();
  texts.push(text);
  return { status: r.status, json: JSON.parse(text) as T };
};

test('bridge: sign in, settings show the login, sign out forgets it; no response carries the token', async () => {
  const before = await call<TrackerSettings>('GET', '/trackers');
  assert.deepEqual(before.json.github.signIn, { available: true, signedIn: false });
  assert.equal(before.json.github.auth, null);
  const start = await call<GitHubSignInStart>('POST', '/trackers/github/sign-in/start');
  assert.equal(start.json.kind, 'code');
  assert.equal((await call<GitHubSignInPoll>('POST', '/trackers/github/sign-in/poll')).json.kind, 'waiting');
  device.approve();
  const done = await call<GitHubSignInPoll>('POST', '/trackers/github/sign-in/poll');
  assert.deepEqual(done.json, { kind: 'signed-in', account: { kind: 'user', login: 'octo-dev' } });
  const after = await call<TrackerSettings>('GET', '/trackers');
  assert.equal(after.json.github.auth, 'signed-in');
  assert.deepEqual(after.json.github.account, { kind: 'user', login: 'octo-dev' });
  assert.deepEqual(after.json.github.signIn, { available: true, signedIn: true });
  assert.equal((await call('GET', '/trackers/github/sign-in/poll')).status, 405);
  const out = await call<TrackerSettings>('DELETE', '/trackers/github/sign-in');
  assert.equal(out.json.github.auth, null);
  assert.equal(out.json.github.signIn.signedIn, false);
  assert.ok(!texts.some((t) => t.includes(TOKEN) || t.includes('dc_')), 'no token or device code in responses');
});
