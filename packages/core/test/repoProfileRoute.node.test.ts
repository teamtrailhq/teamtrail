import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { createTrackerBridge } from '../src/bridge';
import type { CheckSuggestion, RepoFiles } from '../src/model/checkScreening';
import type { RepoProfile } from '../src/model/repoProfile';
import { memoryRepoFiles } from './fakes/memoryRepoFiles';
import { tempFolder } from './tempFolder';

type ProfileBody = { profile: RepoProfile | null; suggestions: CheckSuggestion[] };

/** A bridge over a scratch tracker folder whose repo is `files` (or none), on a random port. */
async function serve(files?: RepoFiles) {
  const root = path.join(tempFolder('teamtrail-profile-route-'), '.teamtrail');
  mkdirSync(root);
  const bridge = createTrackerBridge(root, {
    env: {},
    configDir: path.join(root, 'cfg'),
    leases: { reapMs: 60_000 },
    repoFiles: () => files,
  });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { root, base, close: () => (server.close(), bridge.close()) };
}

const MONOREPO = {
  'package.json': JSON.stringify({ workspaces: ['apps/*'] }),
  'package-lock.json': '{}',
  'apps/web/package.json': JSON.stringify({ scripts: { test: 'ng test' } }),
};

test('GET /repo/profile: the profile and its suggestions, each with its folder', async () => {
  const s = await serve(memoryRepoFiles(MONOREPO));
  try {
    const res = await fetch(`${s.base}/repo/profile`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as ProfileBody;
    assert.equal(body.profile?.layout, 'workspace');
    assert.deepEqual(
      body.suggestions.map((x) => [x.name, x.run.join(' '), x.cwd]),
      [['web-test', 'npm test', 'apps/web']],
    );
  } finally {
    s.close();
  }
});

test('GET /repo/profile without a checkout to read: nothing', async () => {
  const s = await serve();
  try {
    const body = (await (await fetch(`${s.base}/repo/profile`)).json()) as ProfileBody;
    assert.deepEqual(body, { profile: null, suggestions: [] });
  } finally {
    s.close();
  }
});

test('PUT /verification/config saves a suggested check with its folder, approved; a folder not in the repo is refused', async () => {
  const s = await serve(memoryRepoFiles(MONOREPO));
  const put = (checks: unknown, base = 'none') =>
    fetch(`${s.base}/verification/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checks, base, acknowledged: true }),
    });
  try {
    const missing = await put([{ name: 'api-test', run: ['npm', 'test'], cwd: 'apps/api' }]);
    assert.equal(missing.status, 400);
    assert.match(((await missing.json()) as { error: string }).error, /api-test: no folder apps\/api/);
    const outside = await put([{ name: 'x', run: ['npm', 'test'], cwd: '../x' }]);
    assert.equal(outside.status, 400);
    assert.equal((await put([{ name: 'x', run: ['npm', 'test'], cwd: 3 }])).status, 400);
    const ok = await put([{ name: 'web-test', run: ['npm', 'test'], cwd: 'apps/web' }]);
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { approval: { state: string } }).approval.state, 'approved');
    const written = JSON.parse(readFileSync(path.join(s.root, 'verification.json'), 'utf8'));
    assert.deepEqual(written.checks['web-test'], { run: ['npm', 'test'], cwd: 'apps/web' });
  } finally {
    s.close();
  }
});

test('POST /knowledge/commands: one suggested note per package, only once; nothing without a checkout', async () => {
  const s = await serve(memoryRepoFiles(MONOREPO));
  const json = { 'Content-Type': 'application/json' };
  const post = () => fetch(`${s.base}/knowledge/commands`, { method: 'POST', headers: json, body: '{}' });
  try {
    const res = await post();
    const first = (await res.json()) as { added: string[]; updated: string[]; unchanged: string[] };
    assert.equal(res.status, 200, JSON.stringify(first));
    assert.equal(first.added.length, 2);
    const listed = (await (await fetch(`${s.base}/knowledge`)).json()) as {
      entries: { id: string; status: string; title: string; scope: string[] }[];
    };
    assert.deepEqual(
      listed.entries.map((e) => [e.status, e.title, e.scope.join()]),
      [
        ['suggested', 'How to build and test this repo (node)', '**'],
        ['suggested', 'How to build and test apps/web (node)', 'apps/web/**'],
      ],
    );
    const again = (await (await post()).json()) as { added: string[]; unchanged: string[] };
    assert.deepEqual(again.added, []);
    assert.equal(again.unchanged.length, 2);
    const plain = await fetch(`${s.base}/knowledge/commands`, { method: 'POST', body: '{}' });
    assert.equal(plain.status, 403, 'a form post another site could send is refused');
  } finally {
    s.close();
  }
  const none = await serve();
  try {
    const headers = { 'Content-Type': 'application/json' };
    const res = await fetch(`${none.base}/knowledge/commands`, { method: 'POST', headers, body: '{}' });
    assert.equal(res.status, 400);
  } finally {
    none.close();
  }
});
