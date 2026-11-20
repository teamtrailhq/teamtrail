// A write GitHub or Linear refuses for good reaches the human's queue (not only the sync line), with the tracker's
// reason and who made it, and the trail lead retries or discards it.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { TrackerAdapter } from '../src/adapters/adapter';
import { GitHubAdapter } from '../src/adapters/remote/github';
import { LinearAdapter } from '../src/adapters/remote/linear';
import { outboxKey } from '../src/adapters/remote/outboxFile';
import { refusedSink } from '../src/adapters/remote/refusedSink';
import { refusedWrites } from '../src/adapters/remote/refusedWrites';
import type { SyncedAdapter } from '../src/adapters/remote/sync/syncedAdapter';
import { buildAttention } from '../src/attention/buildAttention';
import type { AttentionInput } from '../src/attention/types';
import { chartMap } from '../src/planning/operations/chart';
import { trackerPin } from '../src/server/trackerPin';
import { createTrackerRoutes } from '../src/server/trackerRoutes';
import { fakeGitHub } from './fakes/github';
import { fakeLinear } from './fakes/linear';
import { faulty } from './fixtures';

const REPO = 'octo-org/launchpad';
const SECTIONS = { destination: 'Ship it.', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const AUTHOR = { by: 'agent claude-07 via MCP', origin: 'local:claude-07' };

/** A tracker folder and a config dir for one test, removed after it. */
async function inFolders(fn: (dirs: { root: string; configDir: string }) => Promise<void>) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-refused-'));
  const configDir = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-refused-config-'));
  try {
    await fn({ root, configDir });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
}

const chart = (a: TrackerAdapter) =>
  chartMap(a, {
    title: 'Trail A',
    sections: SECTIONS,
    tickets: [
      { ref: 'a', title: 'First', type: 'task', body: 'Do a.' },
      { ref: 'b', title: 'Second', type: 'task', body: 'Do b.' },
    ],
  });

/** Nothing but the refused writes: the queue as the source makes it. */
const queueOf = (input: Partial<AttentionInput>) =>
  buildAttention({
    snaps: [],
    questions: [],
    sessions: [],
    approvals: [],
    syncs: [],
    leases: [],
    knowledge: [],
    briefs: [],
    now: Date.now(),
    ...input,
  }).items;

/** GitHub answers a comment with 403 while `locked`: the token lost write access. */
function lockable(inner: typeof fetch) {
  const net = faulty(inner);
  const lock = { locked: false };
  net.state.fault = (url, init) =>
    lock.locked && init.method === 'POST' && /\/issues\/\d+\/comments$/.test(url)
      ? new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), { status: 403 })
      : undefined;
  return { net, lock };
}

test('a queued write GitHub refuses for good is kept for the human with its reason and who made it', () =>
  inFolders(async (dirs) => {
    const fake = fakeGitHub({ repo: REPO });
    const { net, lock } = lockable(fake.fetch);
    const key = outboxKey('github', REPO);
    const a = new GitHubAdapter({
      repo: REPO,
      token: 't',
      fetch: net.fetch,
      manual: true,
      sleep: async () => {},
      author: () => AUTHOR,
      refused: refusedSink({
        ...dirs,
        tracker: 'github',
        key,
        issueUrl: (n) => `https://github.com/${REPO}/issues/${n}`,
      }),
    });
    const { map, tickets } = await chart(a);
    a.subscribe(() => {});
    await a.tick();
    const prev = net.state.fault;
    net.state.fault = 'offline';
    await a.comment(map.id, tickets[0].id, 'claude-07', 'Taking this.');
    net.state.fault = prev;
    lock.locked = true;
    await a.tick();

    const [kept] = refusedWrites(dirs.root, dirs.configDir).list();
    assert.equal(kept.write.label, `comment on ${tickets[0].key}`);
    assert.equal(kept.write.by, AUTHOR.by);
    assert.equal(kept.write.origin, AUTHOR.origin);
    assert.match(kept.error, /not accessible/);
    assert.equal(kept.url, `https://github.com/${REPO}/issues/${tickets[0].id}`);

    const [item] = queueOf({ trackerRefused: [kept] });
    assert.equal(item.kind, 'tracker-refused');
    assert.equal(item.mapId, map.id);
    assert.equal(item.ticketId, tickets[0].id);
    assert.equal(item.title, `GitHub refused a write: comment on ${tickets[0].key}`);
    assert.ok(item.reasons.some((r) => /GitHub said: .*not accessible/.test(r)));
    assert.ok(item.reasons.includes(`made by ${AUTHOR.by}`));
    assert.equal(item.url, kept.url);
    a.dispose();
  }));

test('Linear: a refused queued write is kept too', () =>
  inFolders(async (dirs) => {
    const fake = fakeLinear();
    const net = faulty(fake.fetch);
    const a = new LinearAdapter({
      apiKey: 'lin_api_x',
      teamId: 'team-eng',
      fetch: net.fetch,
      manual: true,
      sleep: async () => {},
      author: () => AUTHOR,
      refused: refusedSink({ ...dirs, tracker: 'linear', key: outboxKey('linear', 'team-eng') }),
    });
    const { map, tickets } = await chart(a);
    a.subscribe(() => {});
    await a.tick();
    net.state.fault = 'offline';
    await a.close(map.id, tickets[0].id, 'completed');
    net.state.fault = (_url, init) =>
      String(init.body).includes('issueUpdate')
        ? new Response(JSON.stringify({ errors: [{ message: 'Entity not found', extensions: { code: 'FORBIDDEN' } }] }))
        : undefined;
    await a.tick();
    const [kept] = refusedWrites(dirs.root, dirs.configDir).list();
    assert.equal(kept?.write.label, `close ${tickets[0].key}`);
    assert.equal(kept.tracker, 'linear');
    assert.equal(queueOf({ trackerRefused: [kept] })[0].title, `Linear refused a write: close ${tickets[0].key}`);
    a.dispose();
  }));

test('setting a refused write aside never hides the next refusal; many on one trail are one item', () => {
  const at = Date.now();
  const refused = (id: string, n: number) => ({
    write: {
      id,
      mapId: '1',
      label: `close #${n}`,
      at,
      change: { kind: 'close' as const, ticketId: String(n), reason: 'completed' as const },
    },
    tracker: 'github' as const,
    key: 'k',
    error: 'Not Found',
    at: at + n,
  });
  const first = queueOf({ trackerRefused: [refused('w1', 2)] });
  const state = { v: 1 as const, snoozed: {}, dismissed: [first[0].id] };
  assert.equal(queueOf({ trackerRefused: [refused('w1', 2)], state }).length, 0, 'set aside');
  const next = queueOf({ trackerRefused: [refused('w1', 2), refused('w2', 3)], state });
  assert.deepEqual(
    next.map((i) => i.title),
    ['GitHub refused a write: close #3'],
  );
  const many = queueOf({ trackerRefused: [refused('w1', 2), refused('w2', 3), refused('w3', 4)], state });
  assert.equal(many.length, 1);
  assert.equal(many[0].title, 'GitHub refused 3 writes: close #2, close #3, close #4');
});

/** The tracker routes on a port, as the Lookout serves them, over GitHub connected and approved here. */
async function lookout(dirs: { root: string; configDir: string }, fetchFn: typeof fetch) {
  const config = { active: 'github' as const, github: { repo: REPO } };
  writeFileSync(path.join(dirs.root, 'trackers.json'), JSON.stringify(config));
  trackerPin(dirs.root, dirs.configDir).approve(config);
  const routes = createTrackerRoutes({
    root: dirs.root,
    markdown: {} as TrackerAdapter,
    env: { GITHUB_TOKEN: 'test-token', TEAMTRAIL_NO_GH_CLI: '1' },
    exec: () => Promise.reject(new Error('no exec in tests')),
    fetch: fetchFn,
    configDir: dirs.configDir,
  });
  const server = http.createServer((req, res) => void routes.handle(req, res, new URL(req.url ?? '/', 'http://x')));
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown) =>
    fetch(`${base}/trackers/refused`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  return {
    routes,
    post,
    close() {
      routes.close();
      server.close();
    },
  };
}

async function until(ok: () => boolean, what: string) {
  for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(ok(), what);
}

test('Retry sends a refused write again once access is back; Discard forgets one; both are journaled', () =>
  inFolders(async (dirs) => {
    const fake = fakeGitHub({ repo: REPO });
    const { net, lock } = lockable(fake.fetch);
    const server = await lookout(dirs, net.fetch);
    try {
      const a = (await server.routes.active()) as SyncedAdapter;
      const { map, tickets } = await chart(a);
      const n = Number(tickets[0].id);
      const prev = net.state.fault;
      lock.locked = true;
      net.state.fault = 'offline';
      await a.comment(map.id, tickets[0].id, 'claude-07', 'Taking this.');
      net.state.fault = prev;
      await a.tick();
      const store = refusedWrites(dirs.root, dirs.configDir);
      assert.equal(store.list().length, 1, 'refused and kept');
      const [item] = queueOf({ trackerRefused: store.list() });

      assert.equal((await server.post({ action: 'retry', mapId: map.id, ref: 'w-stale' })).status, 409);
      lock.locked = false;
      const retried = await server.post({ action: 'retry', mapId: map.id, ref: item.ref });
      assert.equal(retried.status, 200);
      assert.equal(store.list().length, 0, 'no longer waits on the human');
      await until(
        () => fake.issues.get(n)!.comments.some((c) => c.body.includes('Taking this.')),
        'the comment reaches GitHub',
      );

      const b = (await server.routes.active()) as SyncedAdapter;
      lock.locked = true;
      net.state.fault = 'offline';
      await b.comment(map.id, tickets[1].id, 'claude-07', 'Second try.');
      net.state.fault = prev;
      await b.tick();
      const [again] = queueOf({ trackerRefused: store.list() });
      assert.equal(b.status.dropped?.length, 1, 'Settings says 1 not sent');
      assert.equal((await server.post({ action: 'discard', mapId: map.id, ref: again.ref })).status, 200);
      assert.equal(store.list().length, 0);
      assert.deepEqual(b.status.dropped, [], 'the sync line no longer counts the discarded write');

      const journal = path.join(dirs.root, '.events', '_trust.jsonl');
      assert.ok(existsSync(journal));
      const actions = readFileSync(journal, 'utf8')
        .trim()
        .split('\n')
        .map((l) => (JSON.parse(l) as { action: string }).action);
      assert.deepEqual(actions, ['write-retried', 'write-discarded']);
    } finally {
      server.close();
    }
  }));

test('the sync line counts a refused write until anyone retries or discards it, and one that could not be kept stays', () =>
  inFolders(async (dirs) => {
    const fake = fakeGitHub({ repo: REPO });
    const { net, lock } = lockable(fake.fetch);
    const sink = refusedSink({ ...dirs, tracker: 'github', key: outboxKey('github', REPO) });
    const make = (refused: typeof sink) =>
      new GitHubAdapter({ repo: REPO, token: 't', fetch: net.fetch, manual: true, sleep: async () => {}, refused });
    const a = make(sink);
    const { map, tickets } = await chart(a);
    a.subscribe(() => {});
    await a.tick();
    const seen: number[] = [];
    a.onStatus((s) => seen.push(s.dropped?.length ?? 0));
    const refuse = async (text: string) => {
      await a.loadMap(map.id);
      const prev = net.state.fault;
      net.state.fault = 'offline';
      await a.comment(map.id, tickets[0].id, 'claude-07', text);
      net.state.fault = prev;
      lock.locked = true;
      await a.tick();
      lock.locked = false;
    };
    await refuse('One.');
    await refuse('Two.');
    assert.equal(a.status.dropped?.length, 2);
    assert.equal(seen.at(-1), 2);
    // another process (the Lookout's route, `teamtrail approve`) settles one in the store
    const store = refusedWrites(dirs.root, dirs.configDir);
    store.take([store.list()[0].write.id]);
    assert.deepEqual(
      a.status.dropped?.map((d) => d.label),
      [`comment on ${tickets[0].key}`],
    );
    store.take(store.list().map((r) => r.write.id));
    assert.deepEqual(a.status.dropped, []);
    a.dispose();

    // a sink that couldn't keep it: the status is the only place it shows, so it stays
    const b = make({
      add: () => {
        throw new Error('disk full');
      },
      kept: () => new Set(),
    });
    b.subscribe(() => {});
    await b.tick();
    await b.loadMap(map.id);
    const prev = net.state.fault;
    net.state.fault = 'offline';
    await b.comment(map.id, tickets[1].id, 'claude-07', 'Three.');
    net.state.fault = prev;
    lock.locked = true;
    await b.tick();
    assert.equal(b.status.dropped?.length, 1);
    b.dispose();
  }));
