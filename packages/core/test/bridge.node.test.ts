import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { TrackerSettings, TrackerTestResult } from '../src/adapters/remote/types';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { parseGitHubRemote, resolveGitHubToken, resolveLinearKey } from '../src/server/trackerConfig';
import { fakeGitHub } from './fakes/github';
import { tempFolder } from './tempFolder';

const GH_TOKEN = 'gho_from_gh_cli_0000';
const PASTED = 'github_pat_pasted_1111';
let server: http.Server;
let bridge: TrackerBridge;
let base: string;
let configDir: string;
let trackerDir: string;
const fake = fakeGitHub({ repo: 'octo-org/launchpad' });

before(async () => {
  const tmp = tempFolder('teamtrail-bridge-');
  configDir = path.join(tmp, 'config');
  trackerDir = path.join(tmp, 'repo', '.teamtrail');
  const exec = async (cmd: string, args: string[]) => {
    if (cmd === 'gh' && args.join(' ') === 'auth token') return GH_TOKEN;
    if (cmd === 'git') return 'git@github.com:octo-org/launchpad.git';
    throw new Error('unexpected command');
  };
  bridge = createTrackerBridge(trackerDir, {
    env: {},
    exec,
    fetch: fake.fetch,
    configDir,
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

const call = async <T>(method: string, p: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, text: await r.clone().text(), json: (await r.json().catch(() => undefined)) as T };
};

test('settings: finds the gh token and the origin repo, and never returns secrets', async () => {
  const r = await call<TrackerSettings>('GET', '/trackers');
  assert.equal(r.status, 200);
  assert.equal(r.json.active, 'markdown');
  assert.equal(r.json.github.auth, 'gh');
  assert.equal(r.json.github.detectedRepo, 'octo-org/launchpad');
  assert.ok(!r.text.includes(GH_TOKEN));
});

test('test connection uses the detected token and repo with no input', async () => {
  const r = await call<TrackerTestResult>('POST', '/trackers/test', { kind: 'github' });
  assert.deepEqual(
    [r.json.ok, r.json.account, r.json.target, r.json.canWrite],
    [true, '@octo-dev', 'octo-org/launchpad', true],
  );
});

test('cross-site requests are refused', async () => {
  const plain = await fetch(base + '/trackers/test', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{"kind":"github"}',
  });
  assert.equal(plain.status, 403);
  const evil = await call('POST', '/trackers/test', { kind: 'github' }, { Origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
});

test('connect: a pasted token goes to the 0600 credentials file, the repo to the project file', async () => {
  const r = await call<TrackerSettings>('PUT', '/trackers', {
    active: 'github',
    github: { repo: 'octo-org/launchpad', token: PASTED },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.active, 'github');
  assert.equal(r.json.github.auth, 'stored');
  const credFile = path.join(configDir, 'credentials.json');
  assert.equal(statSync(credFile).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(credFile, 'utf8')).github.token, PASTED);
  const project = readFileSync(path.join(trackerDir, 'trackers.json'), 'utf8');
  assert.deepEqual(JSON.parse(project), { active: 'github', github: { repo: 'octo-org/launchpad' } });
  assert.ok(!project.includes(PASTED) && !r.text.includes(PASTED));
});

test('adapter calls and decisions go to GitHub once connected', async () => {
  const created = await call<{ result: { id: string } }>('POST', '/tracker/github/call', {
    method: 'createMap',
    args: [
      {
        title: 'Bridge trail',
        sections: { destination: 'Done.', notes: '', decisions: [], unspecified: [], outOfScope: [] },
      },
    ],
  });
  assert.equal(created.status, 200, created.text);
  const id = created.json.result.id;
  assert.ok(fake.issues.get(Number(id))!.labels.includes('teamtrail:map'));

  const d = await call<{ id: string }>('POST', '/decisions', {
    trail: id,
    question: 'Ship?',
    answer: 'Ship it on Friday.',
    decidedBy: 'trail lead',
    source: { kind: 'lookout', ref: 'cmd-1' },
  });
  assert.equal(d.status, 201, d.text);
  assert.ok(fake.issues.get(Number(id))!.comments.some((c) => c.body.includes(`**Decision ${d.json.id}**`)));
  assert.match(fake.issues.get(Number(id))!.body!, /Ship it on Friday\./);

  const bad = await call<{ error: string }>('POST', '/tracker/github/call', { method: 'dispose', args: [] });
  assert.equal(bad.status, 400);
  const missing = await call<{ code: string }>('POST', '/tracker/github/call', { method: 'loadMap', args: ['999'] });
  assert.deepEqual([missing.status, missing.json.code], [404, 'not_found']);
});

test('events stream status and tracker events', async () => {
  const ctrl = new AbortController();
  const r = await fetch(base + '/tracker/github/events', { signal: ctrl.signal });
  const reader = r.body!.getReader();
  let text = '';
  while (!text.includes('event: status')) text += new TextDecoder().decode((await reader.read()).value);
  ctrl.abort();
  assert.match(text, /"location":"octo-org\/launchpad"/);
});

test('connect rejects a repo the token cannot see and keeps the old config', async () => {
  const r = await call<TrackerTestResult>('PUT', '/trackers', {
    active: 'github',
    github: { repo: 'octo-org/secret' },
  });
  assert.deepEqual([r.status, r.json.ok, r.json.code], [400, false, 'not_found']);
  assert.equal(
    JSON.parse(readFileSync(path.join(trackerDir, 'trackers.json'), 'utf8')).github.repo,
    'octo-org/launchpad',
  );
});

test('forgetting the pasted token falls back to gh', async () => {
  const r = await call<TrackerSettings>('DELETE', '/trackers/credentials/github');
  assert.equal(r.json.github.auth, 'gh');
});

test('token resolution order and remote parsing', async () => {
  const gh = async () => 'from-gh';
  assert.deepEqual(await resolveGitHubToken({ github: { token: 's' } }, { GITHUB_TOKEN: 'e' }, gh), {
    token: 's',
    source: 'stored',
  });
  assert.deepEqual(await resolveGitHubToken({}, { GITHUB_TOKEN: 'e', GH_TOKEN: 'g' }, gh), {
    token: 'e',
    source: 'GITHUB_TOKEN',
  });
  assert.deepEqual(await resolveGitHubToken({}, { GH_TOKEN: 'g' }, gh), { token: 'g', source: 'GH_TOKEN' });
  assert.deepEqual(await resolveGitHubToken({}, {}, gh), { token: 'from-gh', source: 'gh' });
  assert.equal(await resolveGitHubToken({}, {}, async () => Promise.reject(new Error('no gh'))), null);
  assert.deepEqual(resolveLinearKey({}, { LINEAR_API_KEY: 'lin_api_1' }), {
    token: 'lin_api_1',
    source: 'LINEAR_API_KEY',
  });
  for (const u of [
    'https://github.com/octo-org/launchpad.git',
    'git@github.com:octo-org/launchpad.git',
    'ssh://git@github.com/octo-org/launchpad',
    'https://x-access-token:abc@github.com/octo-org/launchpad',
  ])
    assert.equal(parseGitHubRemote(u), 'octo-org/launchpad', u);
  assert.equal(parseGitHubRemote('https://gitlab.com/a/b.git'), undefined);
});

test('risk policy: defaults without a file, PUT validates and saves policy.json', async () => {
  const empty = await call<{ defaults: boolean; errors: string[]; policy: { categories: Record<string, string> } }>(
    'GET',
    '/policy',
  );
  assert.equal(empty.status, 200);
  assert.equal(empty.json.defaults, true);
  assert.equal(empty.json.policy.categories.schema, 'high');
  const bad = await call<{ errors: string[] }>('PUT', '/policy', { v: 1, categories: { schema: 'urgent' } });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.json.errors, ['categories.schema must be one of low, medium, high']);
  const policy = { v: 1, categories: { dependencies: 'low' }, paths: [{ glob: 'infra/**', level: 'high' }] };
  const saved = await call<{ defaults: boolean; policy: { categories: Record<string, string> } }>(
    'PUT',
    '/policy',
    policy,
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.json.defaults, false);
  assert.equal(saved.json.policy.categories.dependencies, 'low');
  const file = JSON.parse(readFileSync(path.join(trackerDir, 'policy.json'), 'utf8'));
  assert.deepEqual(file.paths, [{ glob: 'infra/**', level: 'high' }]);
});
