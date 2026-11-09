import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { writeLease } from '../src/agents/leaseStore';
import { createProjectsHub, createTrackerBridge, type ProjectsHub, type TrackerBridge } from '../src/bridge';
import { writeTicketSync } from '../src/evidence/syncStore';
import { writeJsonAtomic } from '../src/lib/jsonFile';
import type { AttentionView } from '../src/model/attention';
import type { ProjectEntry, ProjectsView } from '../src/model/project';
import { claim } from '../src/planning/operations';
import { autoRegister } from '../src/projects/autoRegister';
import { fileAdapter } from '../src/projects/fileAdapter';
import { mergeAttention } from '../src/projects/mergeAttention';
import { ProjectBridges } from '../src/projects/projectBridges';
import { projectId } from '../src/projects/projectId';
import { projectsPath, readProjects } from '../src/projects/projectsFile';
import { projectState } from '../src/projects/projectState';
import { projectSummary } from '../src/projects/projectSummary';
import { registerProject, unregisterProject } from '../src/projects/registerProject';

const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-projects-')));
const configDir = path.join(tmp, 'config');
const now = Date.now();

/** A repo with a trail, a claimed ticket, an agent waiting on a question, a quiet lease and a PR flag. */
async function seedRepo(name: string, question: string) {
  const root = path.join(tmp, name, '.teamtrail');
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const map = await adapter.createMap({
    title: `${name} trail`,
    mode: 'plan+execute',
    sections: { destination: 'Ship it', notes: '', decisions: [], unspecified: [], outOfScope: [] },
  });
  const a = await adapter.createTicket(map.id, { title: 'Build the thing', type: 'execute', body: '' });
  const b = await adapter.createTicket(map.id, { title: 'Pick a format', type: 'junction', hitl: true, body: '' });
  await adapter.createTicket(map.id, { title: 'Ship', type: 'execute', body: '' });
  await claim(adapter, map.id, a.id, { assignee: 'codex-01' });
  const session = { id: `s-${name}`, agent: 'claude-01', mode: 'work', mapId: map.id, step: 1, total: 3 };
  writeJsonAtomic(path.join(root, '.agents', 'sessions', `s-${name}.json`), {
    v: 1,
    session: { ...session, stepLabel: 'work', status: 'running', waitingOn: 'q1', startedAt: now },
    chats: [],
    pending: [
      {
        id: 'q1',
        sessionId: `s-${name}`,
        mapId: map.id,
        agent: 'claude-01',
        text: question,
        at: now,
        urgency: 'blocking',
      },
    ],
    answered: [],
    feed: [],
    pid: process.pid,
    updatedAt: now,
  });
  const lease = { v: 1 as const, mapId: map.id, ticketId: a.id, ticketKey: a.key, agent: 'codex-01', pid: process.pid };
  const quiet = { claimedAt: now - 20 * 60_000, renewedAt: now - 10 * 60_000, ttlMs: 15 * 60_000 };
  writeLease(root, { ...lease, ...quiet, expiresAt: now + 5 * 60_000, notes: [], decisions: [] });
  writeTicketSync(root, {
    ...{ v: 1, mapId: map.id, ticketId: b.id, ticketKey: b.key, provider: 'github' },
    ...{ link: { number: 4, source: 'branch', at: now }, checks: [], checksSummary: 'failing' },
    flags: [{ kind: 'ci-failing', severity: 'alert', text: 'CI failing', since: now }],
  } as never);
  return root;
}

let home: string;
let other: string;
let server: http.Server;
let hub: ProjectsHub;
let homeBridge: TrackerBridge;
let base: string;

before(async () => {
  home = await seedRepo('alpha', 'Which date format?');
  other = await seedRepo('beta', 'SMS or push?');
  homeBridge = createTrackerBridge(home, { env: {}, configDir, cwd: path.dirname(home) });
  hub = createProjectsHub({
    home: homeBridge,
    openBridge: (p) => createTrackerBridge(p.root, { env: {}, configDir, cwd: p.path }),
    configDir,
    bridges: { max: 1, sweepMs: 0 },
    pollMs: 60_000,
  });
  server = http.createServer((req, res) => void hub.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  hub.close();
  homeBridge.close();
  server.closeAllConnections();
  server.close();
});

const call = async <T>(method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json().catch(() => undefined)) as T };
};

test('registry: ids hash the real path, registering twice adds once, removing forgets', () => {
  const link = path.join(tmp, 'alpha-link');
  symlinkSync(path.dirname(home), link);
  assert.equal(projectId(path.join(link, '.teamtrail')), projectId(home));
  const first = registerProject({ configDir, root: other });
  const again = registerProject({ configDir, root: other });
  assert.equal(first.added, true);
  assert.equal(again.added, false);
  assert.equal(first.entry.name, 'beta');
  assert.equal(readProjects(configDir).projects.length, 1);
  const extra = path.join(tmp, 'gamma', '.teamtrail');
  mkdirSync(extra, { recursive: true });
  registerProject({ configDir, root: extra });
  assert.equal(unregisterProject({ configDir, idOrPath: path.dirname(extra) })?.name, 'gamma');
  assert.deepEqual(
    readProjects(configDir).projects.map((p) => p.name),
    ['beta'],
  );
});

test('registry: broken entries are dropped; auto-register honours the opt-outs', () => {
  const dir = path.join(tmp, 'config-broken');
  mkdirSync(dir, { recursive: true });
  writeFileSync(projectsPath(dir), JSON.stringify({ v: 1, projects: [{ id: 'nope' }, 7], autoRegister: false }));
  assert.deepEqual(readProjects(dir), { v: 1, projects: [], autoRegister: false });
  assert.equal(autoRegister({ configDir: dir, root: home, env: {} }), undefined);
  const fresh = path.join(tmp, 'config-fresh');
  assert.equal(autoRegister({ configDir: fresh, root: home, env: { TEAMTRAIL_NO_REGISTER: '1' } }), undefined);
  assert.equal(autoRegister({ configDir: fresh, root: home, optOut: true, env: {} }), undefined);
  assert.equal(existsSync(projectsPath(fresh)), false);
  assert.equal(autoRegister({ configDir: fresh, root: home, env: {} })?.name, 'alpha');
});

test('summary: read from files only, with phases, questions, the queue, flags and quiet claims', async () => {
  const entry: ProjectEntry = {
    id: projectId(other),
    name: 'beta',
    path: path.dirname(other),
    root: other,
    addedAt: 0,
  };
  const { summary, view } = await projectSummary({
    entry,
    home: false,
    state: projectState(other),
    adapter: fileAdapter(other),
    configDir,
    now,
  });
  assert.equal(summary.trails, 1);
  assert.equal(summary.agents, 1);
  assert.equal(summary.questions, 1);
  assert.equal(summary.phases.working, 1);
  assert.equal(summary.flags, 1);
  assert.equal(summary.stalled, 1);
  assert.ok(summary.needsYou >= 1 && view);
  assert.equal(summary.top?.title, 'SMS or push?');
});

test('summary: a missing folder reads as missing and never throws', async () => {
  const gone = path.join(tmp, 'gone', '.teamtrail');
  const entry: ProjectEntry = { id: projectId(gone), name: 'gone', path: path.dirname(gone), root: gone, addedAt: 0 };
  const state = projectState(gone);
  assert.deepEqual(state, { kind: 'missing' });
  const { summary } = await projectSummary({ entry, home: false, state, adapter: fileAdapter(gone), now });
  assert.equal(summary.note, 'Folder not found');
  assert.equal(existsSync(gone), false);
});

test('mergeAttention ranks across projects: interrupting first, then score, then the longest wait', () => {
  const item = (id: string, score: number, since: number) =>
    ({
      id,
      kind: 'question',
      mapId: 'm',
      title: id,
      since,
      urgency: 'soon',
      score,
      reasons: [],
      batchKey: id,
      ref: id,
    }) as const;
  const view = (items: ReturnType<typeof item>[], interrupting: string[] = []) =>
    ({ items, interrupting }) as unknown as AttentionView;
  const merged = mergeAttention([
    { projectId: 'a', project: 'A', view: view([item('a1', 50, 2), item('a2', 90, 5)]) },
    { projectId: 'b', project: 'B', view: view([item('b1', 50, 1), item('b2', 10, 9)], ['b2']) },
  ]);
  assert.deepEqual(
    merged.map((i) => `${i.project}:${i.id}`),
    ['B:b2', 'A:a2', 'B:b1', 'A:a1'],
  );
});

test('bridges: lazy, capped (least recently used goes), held while watched, closed when idle', () => {
  let t = 0;
  const closed: string[] = [];
  const fake = (id: string) => ({
    root: id,
    handle: async () => {},
    active: async () => undefined as never,
    close: () => closed.push(id),
  });
  const pool = new ProjectBridges({ open: (e) => fake(e.id), max: 2, idleMs: 100, sweepMs: 0, now: () => t });
  const entry = (id: string) => ({ id, name: id, path: id, root: id, addedAt: 0 });
  assert.equal(pool.size, 0);
  pool.get(entry('a'));
  t = 10;
  pool.get(entry('b'));
  const release = pool.hold('a');
  t = 20;
  pool.get(entry('c'));
  assert.deepEqual(closed, ['b'], 'the watched bridge stays; the least recently used unwatched one closes');
  assert.equal(pool.size, 2);
  t = 500;
  pool.sweep();
  assert.deepEqual(closed, ['b', 'c'], 'a held bridge is never idle');
  release();
  t = 700;
  pool.sweep();
  assert.deepEqual(closed, ['b', 'c', 'a']);
  assert.equal(pool.size, 0);
});

test('hub: the overview reads every project without opening a bridge', async () => {
  const r = await call<ProjectsView>('GET', '/projects');
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.json.projects.map((p) => [p.name, p.home, p.state.kind]),
    [
      ['alpha', true, 'ok'],
      ['beta', false, 'ok'],
    ],
  );
  const questions = r.json.attention.filter((i) => i.kind === 'question');
  assert.deepEqual(questions.map((i) => i.project).sort(), ['alpha', 'beta']);
  assert.ok(
    questions.every((i) => i.interrupting),
    'blocking questions interrupt in every project',
  );
  assert.equal(hub.bridges.size, 0);
});

test('hub: refuses unregistered ids, paths out of the project and credential files', async () => {
  const id = projectId(other);
  assert.equal((await call('GET', '/p/0123456789/list')).status, 404);
  assert.equal(
    (await call('GET', `/p/${id}/file?path=${encodeURIComponent('../../config/projects.json')}`)).status,
    400,
  );
  symlinkSync(configDir, path.join(other, 'cfg'));
  assert.equal((await call('GET', `/p/${id}/file?path=cfg/projects.json`)).status, 400, 'a symlink out is refused');
  assert.equal((await call('GET', `/p/${id}/file?path=credentials.json`)).status, 400);
  assert.equal(hub.bridges.size, 0, 'refused requests open nothing');
  const list = await call<{ root: string; files: string[] }>('GET', `/p/${id}/list`);
  assert.equal(list.status, 200);
  assert.equal(list.json.root, other);
  assert.equal(hub.bridges.size, 1);
});

test("hub: answering from the overview writes that project's answer file", async () => {
  const id = projectId(other);
  const r = await call<{ sessionId: string }>('POST', `/projects/${id}/answer`, { questionId: 'q1', text: 'Push' });
  assert.equal(r.status, 201);
  const file = path.join(other, '.agents', 'answers', 's-beta', 'q1.json');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).text, 'Push');
  assert.equal(existsSync(path.join(home, '.agents', 'answers', 's-beta')), false);
  assert.equal((await call('POST', '/projects/0123456789/answer', { questionId: 'q1', text: 'x' })).status, 404);
});

test('hub: a project another live Lookout serves is only read, and links there', async () => {
  const gamma = path.join(tmp, 'served', '.teamtrail');
  mkdirSync(path.join(gamma, '.agents'), { recursive: true });
  writeJsonAtomic(path.join(gamma, '.agents', 'server.json'), {
    url: 'http://localhost:7999/',
    pid: process.ppid,
    startedAt: now,
  });
  const { entry } = registerProject({ configDir, root: gamma });
  const r = await call<{ url: string }>('GET', `/p/${entry.id}/list`);
  assert.equal(r.status, 409);
  assert.equal(r.json.url, 'http://localhost:7999/');
  const view = await call<ProjectsView>('GET', '/projects');
  assert.deepEqual(view.json.projects.find((p) => p.id === entry.id)?.state, {
    kind: 'elsewhere',
    url: 'http://localhost:7999/',
  });
});

test('hub: adding a path creates its tracker folder; a missing one reads as missing', async () => {
  const repo = path.join(tmp, 'delta');
  mkdirSync(repo);
  const added = await call<{ entry: ProjectEntry }>('POST', '/projects', { path: repo });
  assert.equal(added.status, 201);
  assert.ok(existsSync(path.join(repo, '.teamtrail')));
  assert.equal((await call('POST', '/projects', { path: path.join(tmp, 'nowhere') })).status, 400);
  const plain = await fetch(`${base}/projects`, { method: 'POST', body: JSON.stringify({ path: repo }) });
  assert.equal(plain.status, 403, 'cross-site writes are refused');
  const gone = registerProject({ configDir, root: path.join(tmp, 'vanished', '.teamtrail') });
  const view = await call<ProjectsView>('GET', '/projects');
  assert.equal(view.status, 200);
  assert.deepEqual(view.json.projects.find((p) => p.id === gone.entry.id)?.state, { kind: 'missing' });
  assert.equal((await call('DELETE', `/projects/${gone.entry.id}`)).status, 200);
});

test('summary: a GitHub project names the repo its issues live in', async () => {
  const root = path.join(tmp, 'gh-project', '.teamtrail');
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, 'trackers.json'),
    JSON.stringify({ active: 'github', github: { repo: 'octo-org/ops' } }),
  );
  const entry: ProjectEntry = { id: 'abc123', name: 'gh-project', path: path.dirname(root), root, addedAt: now };
  const { summary } = await projectSummary({ entry, home: false, state: { kind: 'ok' }, configDir, now });
  assert.deepEqual(summary.tracker, { kind: 'github', cached: false, repo: 'octo-org/ops' });
});

test('summary: a Linear project names its team and organization', async () => {
  const root = path.join(tmp, 'linear-project', '.teamtrail');
  mkdirSync(root, { recursive: true });
  const linear = { teamId: 'team-eng', teamKey: 'ENG', teamName: 'Engineering', orgName: 'Octo Inc' };
  writeFileSync(path.join(root, 'trackers.json'), JSON.stringify({ active: 'linear', linear }));
  const entry: ProjectEntry = { id: 'lin123', name: 'linear-project', path: path.dirname(root), root, addedAt: now };
  const { summary } = await projectSummary({ entry, home: false, state: { kind: 'ok' }, configDir, now });
  assert.deepEqual(summary.tracker, { kind: 'linear', cached: false, team: 'ENG', org: 'Octo Inc' });
});
