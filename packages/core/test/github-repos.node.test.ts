import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { githubAccount, listGitHubRepos } from '../src/adapters/remote/github';
import type { GitHubRepoList, TrackerSettings, TrackerTestResult } from '../src/adapters/remote/types';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { fakeGitHub, type FakeRepo } from './fakes/github';

const TOKEN = 'gho_secret_picker_token_4242';
const READ = { admin: false, maintain: false, push: false, triage: false, pull: true };

const many = (n: number): FakeRepo[] =>
  Array.from({ length: n }, (_, i) => ({ full_name: `octo-org/repo-${String(i).padStart(3, '0')}` }));

test('account: the login behind a token, or a plain reason when GitHub refuses it', async () => {
  const fake = fakeGitHub({ login: 'mona', token: TOKEN });
  assert.deepEqual(await githubAccount({ token: TOKEN, fetch: fake.fetch }), { kind: 'user', login: 'mona' });
  const bad = await githubAccount({ token: 'nope', fetch: fake.fetch });
  assert.equal(bad.kind, 'unknown');
  assert.equal(bad.kind === 'unknown' && bad.code, 'auth');
  assert.ok(bad.kind === 'unknown' && !bad.error.includes('nope'));
});

test('repos: follows Link pages and keeps repos with issues on and push or triage rights', async () => {
  const fake = fakeGitHub({
    repo: 'octo-org/launchpad',
    repos: [
      ...many(150),
      { full_name: 'octo-org/no-issues', has_issues: false },
      { full_name: 'octo-org/old', archived: true },
      { full_name: 'octo-org/read-only', permissions: READ },
      { full_name: 'octo-org/triage', permissions: { ...READ, triage: true } },
    ],
  });
  const seen: string[] = [];
  const counted = ((input: string, init: RequestInit) => {
    seen.push(String(input));
    return fake.fetch(input, init);
  }) as typeof fetch;
  const r = await listGitHubRepos({ token: TOKEN, fetch: counted });
  assert.equal(seen.length, 2, 'two pages of 100');
  assert.match(seen[0], /affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100/);
  const names = r.repos.map((x) => x.fullName);
  assert.equal(names[0], 'octo-org/launchpad');
  assert.ok(names.includes('octo-org/triage'));
  for (const left of ['octo-org/no-issues', 'octo-org/old', 'octo-org/read-only']) assert.ok(!names.includes(left));
  assert.equal(r.repos.length, 152);
  assert.equal(r.truncated, false);
});

test('repos: stops at the cap and says the list is cut', async () => {
  const fake = fakeGitHub({ repos: many(400) });
  const r = await listGitHubRepos({ token: TOKEN, fetch: fake.fetch, cap: 250 });
  assert.equal(r.repos.length, 250);
  assert.equal(r.truncated, true);
});

let server: http.Server;
let bridge: TrackerBridge;
let base: string;
let trackerDir: string;
let calls = 0;
const fake = fakeGitHub({
  repo: 'octo-org/launchpad',
  login: 'octo-dev',
  token: TOKEN,
  repos: [{ full_name: 'octo-org/tracker' }, { full_name: 'octo-org/quiet', has_issues: false }],
});

before(async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-picker-'));
  trackerDir = path.join(tmp, 'repo', '.teamtrail');
  const exec = async (cmd: string) => {
    if (cmd === 'gh') return TOKEN;
    if (cmd === 'git') return 'https://github.com/octo-org/launchpad.git';
    throw new Error('unexpected command');
  };
  const counted = ((input: string, init: RequestInit) => {
    calls++;
    return fake.fetch(input, init);
  }) as typeof fetch;
  bridge = createTrackerBridge(trackerDir, {
    env: {},
    exec,
    fetch: counted,
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

const texts: string[] = [];
const call = async <T>(method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  texts.push(text);
  return { status: r.status, json: JSON.parse(text) as T };
};

test('bridge settings say who the found token signs in as, and where it came from', async () => {
  const r = await call<TrackerSettings>('GET', '/trackers');
  assert.equal(r.json.github.auth, 'gh');
  assert.deepEqual(r.json.github.account, { kind: 'user', login: 'octo-dev' });
  assert.equal(r.json.github.detectedRepo, 'octo-org/launchpad');
  assert.equal(r.json.active, 'markdown', 'nothing connects on its own');
});

test('bridge lists the repos with the login, the detected repo first, and caches the list', async () => {
  const first = await call<GitHubRepoList>('GET', '/trackers/github/repos');
  assert.equal(first.status, 200);
  assert.equal(first.json.kind, 'ok');
  if (first.json.kind !== 'ok') return;
  assert.deepEqual(first.json.account, { kind: 'user', login: 'octo-dev' });
  assert.equal(first.json.auth, 'gh');
  assert.equal(first.json.detectedRepo, 'octo-org/launchpad');
  assert.deepEqual(
    first.json.repos.map((r) => r.fullName),
    ['octo-org/launchpad', 'octo-org/tracker'],
  );
  const before = calls;
  await call('GET', '/trackers/github/repos');
  assert.equal(calls, before, 'served from the cache');
  const post = await call('POST', '/trackers/github/repos', {});
  assert.equal(post.status, 405);
});

test('connecting another repo saves it in this project; one without issues is refused and nothing switches', async () => {
  const quiet = await call<TrackerTestResult>('PUT', '/trackers', {
    active: 'github',
    github: { repo: 'octo-org/quiet' },
  });
  assert.equal(quiet.status, 400);
  assert.match(quiet.json.error!, /Issues are turned off in octo-org\/quiet/);
  const missing = await call<TrackerTestResult>('PUT', '/trackers', {
    active: 'github',
    github: { repo: 'octo-org/hidden' },
  });
  assert.equal(missing.status, 400);
  assert.match(missing.json.error!, /octo-org\/hidden not found, or this token can't read it/);
  assert.equal((await call<TrackerSettings>('GET', '/trackers')).json.active, 'markdown');

  const ok = await call<TrackerSettings>('PUT', '/trackers', {
    active: 'github',
    github: { repo: 'octo-org/tracker' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.github.repo, 'octo-org/tracker');
  const saved = JSON.parse(readFileSync(path.join(trackerDir, 'trackers.json'), 'utf8'));
  assert.deepEqual(saved, { active: 'github', github: { repo: 'octo-org/tracker' } });
});

test('no route response ever carries the token', () => {
  assert.ok(texts.length >= 6);
  for (const t of texts) assert.ok(!t.includes(TOKEN), t.slice(0, 200));
});

test('without a token the picker says so instead of listing', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-picker-none-'));
  const none = createTrackerBridge(path.join(tmp, '.teamtrail'), {
    env: {},
    exec: async () => {
      throw new Error('no gh');
    },
    fetch: fake.fetch,
    configDir: path.join(tmp, 'config'),
    cwd: tmp,
  });
  const s = http.createServer((req, res) => void none.handle(req, res));
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
  const list = (await (await fetch(url + '/trackers/github/repos')).json()) as GitHubRepoList;
  const settings = (await (await fetch(url + '/trackers')).json()) as TrackerSettings;
  none.close();
  s.close();
  assert.deepEqual(list, { kind: 'no-token' });
  assert.equal(settings.github.auth, null);
  assert.equal(settings.github.account, undefined);
});
