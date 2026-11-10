import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { TrackerAdapter } from '../src/adapters/adapter';
import { GitHubAdapter } from '../src/adapters/remote/github';
import { LinearAdapter } from '../src/adapters/remote/linear';
import { orphanedWrites, outboxDir, outboxFile, outboxKey } from '../src/adapters/remote/outboxFile';
import type { SyncedAdapter } from '../src/adapters/remote/sync/syncedAdapter';
import type { OutboxStore } from '../src/adapters/remote/sync/types';
import type { TrackerSettings } from '../src/adapters/remote/types';
import { chartMap } from '../src/planning/operations/chart';
import { trackerPin } from '../src/server/trackerPin';
import { createTrackerRoutes } from '../src/server/trackerRoutes';
import { fakeGitHub } from './fakes/github';
import { fakeLinear } from './fakes/linear';
import { faulty } from './fixtures';
import { noSleep } from './scenarios';

/*
 * Queue offline → kill → restart → drain once. The first run is a child
 * process that charts a trail, loses the network, queues writes and is
 * SIGKILLed; the restarted adapters talk to the same fake over HTTP.
 */

type Kind = 'github' | 'linear';
const REPO = 'octo-org/launchpad';
const TEAM = 'team-eng';
const key = (kind: Kind) => (kind === 'github' ? outboxKey('github', REPO) : outboxKey('linear', TEAM));

function adapter(kind: Kind, api: string, o: { fetch?: typeof fetch; outbox?: OutboxStore } = {}): SyncedAdapter {
  const common = {
    fetch: o.fetch,
    outbox: o.outbox,
    manual: true,
    retries: 0,
    ...noSleep,
  };
  return kind === 'github'
    ? new GitHubAdapter({
        repo: REPO,
        token: 'test-token',
        apiUrl: api,
        ...common,
      })
    : new LinearAdapter({
        apiKey: 'lin_api_x',
        teamId: TEAM,
        apiUrl: api,
        ...common,
      });
}

/** First run: queue writes while offline, report, then wait to be killed. */
async function firstRun(kind: Kind, api: string, root: string) {
  const net = faulty(fetch);
  const a = adapter(kind, api, {
    fetch: net.fetch,
    outbox: outboxFile(root, key(kind)),
  });
  const { map, tickets } = await chartMap(a, {
    title: 'Ship offline sync',
    sections: {
      destination: 'Edits made offline survive a restart.',
      notes: '',
      decisions: [],
      unspecified: [],
      outOfScope: [],
    },
    tickets: [
      {
        ref: 'r',
        title: 'Survey CRDT libraries',
        type: 'research',
        body: 'Compare.',
      },
      {
        ref: 'g',
        title: 'Pick a conflict policy',
        type: 'junction',
        body: 'LWW or merge?',
      },
    ],
  });
  const [r, g] = tickets;
  net.state.fault = 'offline';
  await a.comment(map.id, r.id, 'claude-07', 'Queued while offline.');
  await a.assign(map.id, r.id, 'claude-07');
  await a.addBlocking(map.id, r.id, g.id);
  await a.createDecision(map.id, {
    question: 'Which CRDT?',
    answer: 'Use Yjs.',
    decidedBy: 'claude-07',
    ticketId: r.id,
    source: { kind: 'agent' },
  });
  await a.close(map.id, r.id, 'completed');
  await a.setMapMode(map.id, 'plan-only');
  await a.updateMapSections(map.id, { notes: 'Written offline.' });
  console.log(
    JSON.stringify({
      mapId: map.id,
      r: r.id,
      g: g.id,
      queued: a.status.queued,
      state: a.status.state,
    }),
  );
  setInterval(() => {}, 1000);
}

/** The fake tracker over HTTP, counting comment posts. */
async function serve(kind: Kind) {
  const fake = kind === 'github' ? fakeGitHub({ repo: REPO }) : fakeLinear();
  let commentPosts = 0;
  let offline = false;
  const server = http.createServer(async (req, res) => {
    if (offline) return void req.socket.destroy();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    if (
      kind === 'github'
        ? req.method === 'POST' && /\/issues\/\d+\/comments$/.test(req.url ?? '')
        : /^\s*mutation\s+Comment\b/.test(JSON.parse(body || '{}').query ?? '')
    )
      commentPosts++;
    const r = await fake.fetch(`http://fake${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: body || undefined,
    });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    api: kind === 'linear' ? `${api}/graphql` : api,
    posts: () => commentPosts,
    offline: (on: boolean) => (offline = on),
    close: () => new Promise((ok) => (server.closeAllConnections(), server.close(ok))),
  };
}

async function killedFirstRun(kind: Kind, api: string, root: string) {
  const child = spawn(process.execPath, ['--enable-source-maps', fileURLToPath(import.meta.url)], {
    env: {
      ...process.env,
      OUTBOX_CHILD: JSON.stringify({ kind, api, root }),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: child.stdout! });
  const report = await new Promise<{
    mapId: string;
    r: string;
    g: string;
    queued: number;
    state: string;
  }>((ok, fail) => {
    lines.once('line', (l) => ok(JSON.parse(l)));
    child.once('exit', (code) => fail(new Error(`first run exited early (${code})`)));
  });
  const exited = new Promise((ok) => child.once('exit', ok));
  child.kill('SIGKILL');
  await exited;
  return report;
}

/** What the tracker holds, read by an adapter without a queue. */
async function remote(kind: Kind, api: string, mapId: string, ticketId: string) {
  const a = adapter(kind, api);
  const snap = await a.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId)!;
  return {
    snap,
    t,
    decisions: await a.listDecisions(mapId),
    blocked: snap.tickets.find((x) => x.id !== ticketId)!,
  };
}

for (const kind of process.env.OUTBOX_CHILD ? [] : (['github', 'linear'] as const)) {
  test(`${kind}: writes queued offline survive a kill and drain exactly once after restart`, async () => {
    const fake = await serve(kind);
    const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-outbox-'));
    try {
      const first = await killedFirstRun(kind, fake.api, root);
      assert.deepEqual([first.state, first.queued], ['offline', 7]);

      const dir = root;
      const [queued] = readdirSync(dir);
      assert.equal(statSync(path.join(dir, queued)).mode & 0o777, 0o600, 'only this user can read the queue');
      assert.equal(orphanedWrites(root, key(kind)), 7, 'the dead run left its queue on disk');
      const before = await remote(kind, fake.api, first.mapId, first.r);
      assert.deepEqual(
        [before.t.comments.length, before.t.state, before.decisions.length],
        [0, 'open', 0],
        'nothing reached the tracker',
      );

      const b = adapter(kind, fake.api, {
        outbox: outboxFile(root, key(kind)),
      });
      assert.equal(b.status.queued, 7, 'Settings shows the queued count before anything is sent');
      assert.equal(orphanedWrites(root, key(kind)), 0, 'adopted: no other process replays it');
      const shown = (await b.loadMap(first.mapId)).tickets.find((t) => t.id === first.r)!;
      assert.equal(shown.comments.at(-1)?.body, 'Queued while offline.', 'queued writes show before they are sent');
      assert.equal(shown.state, 'closed');

      await b.tick();
      assert.deepEqual([b.status.state, b.status.queued, b.status.error], ['online', 0, undefined]);
      assert.deepEqual(readdirSync(dir), [], 'drained queue leaves no file');

      const after = await remote(kind, fake.api, first.mapId, first.r);
      assert.deepEqual(
        after.t.comments.map((c) => [c.author, c.body]),
        [['claude-07', 'Queued while offline.']],
      );
      assert.equal(after.t.assignee, 'claude-07');
      assert.deepEqual([after.t.state, after.t.closeReason], ['closed', 'completed']);
      assert.deepEqual(after.blocked.blockedBy, [first.r]);
      assert.deepEqual(
        after.decisions.map((d) => [d.id, d.answer, d.ticketId]),
        [['D-1', 'Use Yjs.', first.r]],
      );
      assert.equal(after.snap.map.mode, 'plan-only');
      assert.equal(after.snap.map.sections.notes, 'Written offline.');
      assert.equal(fake.posts(), 2, 'one comment and one decision record');

      b.dispose();
      const c = adapter(kind, fake.api, {
        outbox: outboxFile(root, key(kind)),
      });
      assert.equal(c.status.queued, 0);
      await c.tick();
      assert.equal(fake.posts(), 2, 'a second restart sends nothing');
    } finally {
      await fake.close();
    }
  });

  test(`${kind}: a run that dies after sending but before saving does not post twice`, async () => {
    const fake = await serve(kind);
    const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-outbox-'));
    try {
      const first = await killedFirstRun(kind, fake.api, root);
      // sends everything, but its saves never reach the disk: the file still lists all seven writes
      const store = outboxFile(root, key(kind));
      const b = adapter(kind, fake.api, {
        outbox: { load: () => store.load(), save() {}, release() {} },
      });
      await b.tick();
      assert.equal(b.status.queued, 0);
      assert.equal(fake.posts(), 2);
      store.release();

      const c = adapter(kind, fake.api, {
        outbox: outboxFile(root, key(kind)),
      });
      assert.equal(c.status.queued, 7, 'the stale file is replayed');
      await c.tick();
      assert.deepEqual([c.status.state, c.status.queued, c.status.error], ['online', 0, undefined]);
      assert.equal(fake.posts(), 2, 'comment and decision already landed: skipped');
      const after = await remote(kind, fake.api, first.mapId, first.r);
      assert.equal(after.t.comments.length, 1);
      assert.equal(after.decisions.length, 1);
      assert.deepEqual(after.blocked.blockedBy, [first.r], 'no duplicate blocking relation');
      assert.equal(after.t.assignee, 'claude-07');
    } finally {
      await fake.close();
    }
  });
}

if (!process.env.OUTBOX_CHILD)
  test('settings: after a restart the sync line reports the queue a dead run left', async () => {
    const fake = await serve('github');
    const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-outbox-'));
    const configDir = path.join(root, 'config');
    // the queue of this machine's earlier run, where Teamtrail keeps it: outside the repo
    await killedFirstRun('github', fake.api, outboxDir(root, configDir));
    const gh = { active: 'github' as const, github: { repo: REPO } };
    writeFileSync(path.join(root, 'trackers.json'), JSON.stringify(gh));
    trackerPin(root, configDir).approve(gh);
    fake.offline(true);
    // the restarted Lookout: nothing asks for the adapter, yet the queue is picked up
    const routes = createTrackerRoutes({
      root,
      markdown: {} as TrackerAdapter,
      env: { GITHUB_TOKEN: 'test-token', TEAMTRAIL_GITHUB_API: fake.api },
      exec: () => Promise.reject(new Error('no exec in tests')),
      configDir,
    });
    const server = http.createServer(
      (req, res) => void routes.handle(req, res, new URL(req.url ?? '/', 'http://localhost')),
    );
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    try {
      const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/trackers`);
      const settings = (await r.json()) as TrackerSettings;
      assert.equal(settings.github.status?.queued, 7);
    } finally {
      routes.close();
      server.close();
      await fake.close();
    }
  });

if (!process.env.OUTBOX_CHILD)
  test('a queue is adopted by one adapter only, and only for its own tracker target', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-outbox-'));
    const w = {
      id: 'w1',
      mapId: '1',
      label: 'close #2',
      at: 1,
      change: {
        kind: 'close' as const,
        ticketId: '2',
        reason: 'completed' as const,
      },
    };
    const first = outboxFile(root, outboxKey('github', REPO));
    first.load();
    first.save([w]);
    assert.equal(orphanedWrites(root, outboxKey('github', REPO)), 0, 'owned by a live adapter');
    first.release();
    assert.equal(orphanedWrites(root, outboxKey('github', 'octo-org/other')), 0, 'another repo never sees it');
    assert.deepEqual(outboxFile(root, outboxKey('github', REPO)).load(), [w]);
    assert.deepEqual(outboxFile(root, outboxKey('github', REPO)).load(), [], 'already claimed');
  });

if (process.env.OUTBOX_CHILD) {
  const { kind, api, root } = JSON.parse(process.env.OUTBOX_CHILD) as {
    kind: Kind;
    api: string;
    root: string;
  };
  await firstRun(kind, api, root);
}
