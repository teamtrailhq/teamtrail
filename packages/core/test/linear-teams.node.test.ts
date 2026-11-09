import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { linearViewer, listLinearProjects, listLinearTeams, testLinear } from '../src/adapters/remote/linear';
import type {
  LinearProjectList,
  LinearTeamList,
  TrackerSettings,
  TrackerTestResult,
} from '../src/adapters/remote/types';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { fakeLinear, type FakeLinearTeam } from './fakes/linear';

const KEY = 'lin_api_secret_picker_key_4242';
const PASTED = 'lin_api_pasted_key_never_echoed_77';

const many = (n: number): FakeLinearTeam[] =>
  Array.from({ length: n }, (_, i) => ({ id: `team-${i}`, key: `T${i}`, name: `Team ${i}` }));

const design: FakeLinearTeam = {
  id: 'team-design',
  key: 'DES',
  name: 'Design',
  activeAt: '2026-11-08T10:00:00.000Z',
  projects: [
    { id: 'proj-brand', name: 'Brand refresh', state: 'started' },
    { id: 'proj-icons', name: 'Icons', state: 'planned' },
  ],
};

test('viewer: the name, email and organization behind a key, or a plain reason when Linear refuses it', async () => {
  const fake = fakeLinear({ apiKey: KEY, viewer: { name: 'Grace Ops', email: 'grace@octo.dev' }, org: 'Octo Inc' });
  assert.deepEqual(await linearViewer({ apiKey: KEY, fetch: fake.fetch }), {
    kind: 'user',
    name: 'Grace Ops',
    email: 'grace@octo.dev',
    orgName: 'Octo Inc',
  });
  const bad = await linearViewer({ apiKey: 'lin_api_nope', fetch: fake.fetch });
  assert.equal(bad.kind, 'unknown');
  assert.equal(bad.kind === 'unknown' && bad.code, 'auth');
  assert.ok(bad.kind === 'unknown' && !bad.error.includes('lin_api_nope'));
});

test('teams: follows cursor pages, most recently active first, and stops at the cap', async () => {
  const fake = fakeLinear({ apiKey: KEY, teams: [...many(120), design] });
  let calls = 0;
  const counted = ((input: string, init: RequestInit) => {
    calls++;
    return fake.fetch(input, init);
  }) as typeof fetch;
  const all = await listLinearTeams({ apiKey: KEY, fetch: counted });
  assert.equal(calls, 3, 'three pages of 50');
  assert.equal(all.teams.length, 122);
  assert.equal(all.truncated, false);
  assert.deepEqual(all.teams[0], { id: 'team-design', key: 'DES', name: 'Design', activeAt: design.activeAt });
  const cut = await listLinearTeams({ apiKey: KEY, fetch: fake.fetch, cap: 60 });
  assert.equal(cut.teams.length, 60);
  assert.equal(cut.truncated, true);
});

test('projects: a team’s projects with their state; an unknown team is refused', async () => {
  const fake = fakeLinear({ apiKey: KEY, teams: [design] });
  const r = await listLinearProjects({ apiKey: KEY, teamId: 'team-design', fetch: fake.fetch });
  assert.deepEqual(r, { projects: design.projects, truncated: false });
  await assert.rejects(listLinearProjects({ apiKey: KEY, teamId: 'team-ghost', fetch: fake.fetch }));
});

test('test: a team the key cannot read fails in plain words; a project outside the team too', async () => {
  const fake = fakeLinear({ apiKey: KEY, teams: [design] });
  const ghost = await testLinear({ apiKey: KEY, teamId: 'team-ghost', fetch: fake.fetch });
  assert.equal(ghost.ok, false);
  assert.match(ghost.error!, /This Linear key can't read that team/);
  const wrong = await testLinear({ apiKey: KEY, teamId: 'team-design', projectId: 'proj-mobile', fetch: fake.fetch });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error!, /That project isn't in Design/);
  const ok = await testLinear({ apiKey: KEY, teamId: 'team-design', projectId: 'proj-icons', fetch: fake.fetch });
  assert.equal(ok.ok, true);
  assert.equal(ok.organization, 'Octo Inc');
});

let server: http.Server;
let bridge: TrackerBridge;
let base: string;
let trackerDir: string;
let configDir: string;
let calls = 0;
const fake = fakeLinear({ apiKey: KEY, teams: [design] });
const pastedFake = fakeLinear({ apiKey: PASTED, viewer: { name: 'Pat Paste' }, org: 'Paste Co' });

before(async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-linear-picker-'));
  trackerDir = path.join(tmp, 'repo', '.teamtrail');
  configDir = path.join(tmp, 'config');
  const counted = ((input: string, init: RequestInit) => {
    calls++;
    const auth = new Headers(init.headers).get('authorization');
    return (auth === PASTED ? pastedFake : fake).fetch(input, init);
  }) as typeof fetch;
  bridge = createTrackerBridge(trackerDir, {
    env: { LINEAR_API_KEY: KEY },
    exec: async () => {
      throw new Error('no gh');
    },
    fetch: counted,
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

test('bridge settings say who the found key belongs to, and nothing connects on its own', async () => {
  const r = await call<TrackerSettings>('GET', '/trackers');
  assert.equal(r.json.linear.auth, 'LINEAR_API_KEY');
  assert.deepEqual(r.json.linear.viewer, { kind: 'user', name: 'Ada Ops', email: 'ada@octo.dev', orgName: 'Octo Inc' });
  assert.equal(r.json.active, 'markdown');
});

test('bridge lists the teams with who the key belongs to, and caches the list', async () => {
  const first = await call<LinearTeamList>('GET', '/trackers/linear/teams');
  assert.equal(first.status, 200);
  assert.equal(first.json.kind, 'ok');
  if (first.json.kind !== 'ok') return;
  assert.equal(first.json.auth, 'LINEAR_API_KEY');
  assert.equal(first.json.viewer.kind === 'user' && first.json.viewer.orgName, 'Octo Inc');
  assert.deepEqual(
    first.json.teams.map((t) => t.key),
    ['DES', 'ENG'],
  );
  const seen = calls;
  await call('GET', '/trackers/linear/teams');
  assert.equal(calls, seen, 'served from the cache');
  const del = await call('DELETE', '/trackers/linear/teams');
  assert.equal(del.status, 405);
});

test('bridge lists a team’s projects; a team is required', async () => {
  const r = await call<LinearProjectList>('GET', '/trackers/linear/projects?team=team-design');
  assert.deepEqual(r.json, { kind: 'ok', projects: design.projects, truncated: false });
  const missing = await call<{ error: string }>('GET', '/trackers/linear/projects');
  assert.equal(missing.status, 400);
});

test('a key pasted in the page lists its own teams and is never echoed back', async () => {
  const r = await call<LinearTeamList>('POST', '/trackers/linear/teams', { apiKey: PASTED });
  assert.equal(r.json.kind, 'ok');
  if (r.json.kind !== 'ok') return;
  assert.equal(r.json.auth, null);
  assert.deepEqual(r.json.viewer, { kind: 'user', name: 'Pat Paste', email: 'ada@octo.dev', orgName: 'Paste Co' });
  const bad = await call<LinearTeamList>('POST', '/trackers/linear/teams', { apiKey: 'lin_api_wrong_one' });
  assert.equal(bad.json.kind, 'error');
  assert.match(bad.json.kind === 'error' ? bad.json.error : '', /API key rejected/);
});

test('connecting a team the key cannot read is refused and nothing switches', async () => {
  const r = await call<TrackerTestResult>('PUT', '/trackers', { active: 'linear', linear: { teamId: 'team-ghost' } });
  assert.equal(r.status, 400);
  assert.match(r.json.error!, /This Linear key can't read that team/);
  assert.equal((await call<TrackerSettings>('GET', '/trackers')).json.active, 'markdown');
});

test('connecting saves Linear’s names for the team, project and organization in this project', async () => {
  const r = await call<TrackerSettings>('PUT', '/trackers', {
    active: 'linear',
    linear: { teamId: 'team-design', teamKey: 'FAKE', teamName: 'Spoofed', projectId: 'proj-icons' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.active, 'linear');
  assert.equal(r.json.linear.teamKey, 'DES');
  const saved = JSON.parse(readFileSync(path.join(trackerDir, 'trackers.json'), 'utf8'));
  assert.deepEqual(saved.linear, {
    teamId: 'team-design',
    teamKey: 'DES',
    teamName: 'Design',
    projectId: 'proj-icons',
    projectName: 'Icons',
    orgName: 'Octo Inc',
  });
});

test('no route response ever carries a key', () => {
  assert.ok(texts.length >= 10);
  for (const t of texts) {
    assert.ok(!t.includes(KEY), t.slice(0, 200));
    assert.ok(!t.includes(PASTED), t.slice(0, 200));
  }
});

test('without a key the picker says so instead of listing', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-linear-none-'));
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
  const list = (await (await fetch(url + '/trackers/linear/teams')).json()) as LinearTeamList;
  const settings = (await (await fetch(url + '/trackers')).json()) as TrackerSettings;
  none.close();
  s.close();
  assert.deepEqual(list, { kind: 'no-key' });
  assert.equal(settings.linear.auth, null);
  assert.equal(settings.linear.viewer, undefined);
});
