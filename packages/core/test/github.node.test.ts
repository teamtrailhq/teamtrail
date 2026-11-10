import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { GitHubAdapter, testGitHub } from '../src/adapters/remote/github';
import { replay } from './fixtures';
import {
  FROZEN,
  freezeTime,
  trailFlow,
  lateTrailFlow,
  noSleep,
  offlineFlow,
  rateLimitFlow,
  syncFlow,
} from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

const adapter =
  (fetch: typeof globalThis.fetch, repo = 'octo-org/launchpad') =>
  () =>
    new GitHubAdapter({ repo, token: 'test-token', fetch, manual: true, ...noSleep });

test('trail flow: issues, sub-issues, blocking, claims, comments and decisions round-trip through GitHub', async () => {
  const rp = replay('github-flow.json');
  const r = await trailFlow(adapter(rp.fetch));
  rp.done();

  assert.deepEqual(r.before, []);
  assert.deepEqual(r.maps, [{ id: r.map.id, key: `#${r.map.id}`, title: 'Ship offline sync' }]);
  // a fresh adapter reads back exactly what the first one cached
  assert.deepEqual(
    r.snap.tickets.map((t) => [t.id, t.type, t.state, t.closeReason, t.assignee, t.blockedBy]),
    r.cached.tickets.map((t) => [t.id, t.type, t.state, t.closeReason, t.assignee, t.blockedBy]),
  );
  assert.equal(r.snap.map.mode, 'plan-only');

  const [research, junction] = r.snap.tickets;
  assert.equal(research.key, r.r.key);
  assert.equal(research.state, 'closed');
  assert.equal(research.closeReason, 'completed');
  assert.equal(research.assignee, 'claude-07', 'claim survives as a body marker');
  assert.ok(!research.body.includes('teamtrail:meta'), 'marker is hidden from the ticket body');
  assert.deepEqual(
    research.comments.map((c) => [c.author, c.body.split('\n')[0]]),
    [
      ['claude-07', 'Yjs has the smaller bundle.'],
      ['claude-07', '**Resolution**'],
    ],
  );
  assert.equal(junction.type, 'junction');
  assert.deepEqual(junction.blockedBy, [research.id], 'native blocked-by dependency');

  const byId = Object.fromEntries(r.decisions.map((d) => [d.id, d]));
  assert.deepEqual(Object.keys(byId).sort(), ['D-1', 'D-2']);
  assert.equal(byId['D-1'].supersededBy, 'D-2');
  assert.equal(byId['D-2'].supersedes, 'D-1');
  assert.equal(byId['D-2'].ticketId, research.id, 'decision is linked back to its ticket');
  assert.equal(byId['D-2'].source.kind, 'lookout');
  assert.equal(byId['D-1'].decidedAt, FROZEN);
  assert.deepEqual(r.snap.map.sections.decisions, [
    { ticketKey: research.key, text: 'Use Automerge. Its history model fits the audit trail.' },
  ]);
});

test('decision records are posted as readable comments on the ticket', () => {
  const rp = replay('github-flow.json');
  const posts = rp.fixture.exchanges
    .filter((e) => e.req.method === 'POST' && /\/issues\/\d+\/comments$/.test(e.req.url))
    .map((e) => (e.req.body as { body: string }).body);
  const record = posts.find((b) => b.startsWith('**Decision D-1**'));
  assert.ok(record, 'D-1 comment');
  assert.match(record!, /> Use Yjs\./);
  assert.match(record!, /<!-- teamtrail:decision \{/);
});

test('trails charted by another process show up on the next poll, including before the first one', async () => {
  const rp = replay('github-late-trail.json');
  const r = await lateTrailFlow(adapter(rp.fetch));
  rp.done();
  assert.deepEqual(r.before, []);
  assert.deepEqual(
    r.after.map((m) => m.id),
    [r.map.id],
  );
  assert.deepEqual(r.later.map((m) => m.id).sort(), [r.map.id, r.second.id].sort());
  assert.ok(r.events.some((e) => e.kind === 'external.changed'));
});

test('sync: a teammate closing and commenting in GitHub reaches subscribers; an idle repo polls with free 304s', async () => {
  const rp = replay('github-sync.json');
  const r = await syncFlow(adapter(rp.fetch), { act() {} });
  rp.done();
  assert.equal(r.quiet, 0, 'the first poll resyncs but finds nothing new');
  assert.deepEqual(
    r.seen.map((e) => e.kind),
    ['external.changed'],
  );
  assert.equal(r.idle, 0);
  const t = r.after.tickets[0];
  assert.equal(t.state, 'closed');
  assert.deepEqual(t.comments.at(-1), {
    id: t.comments.at(-1)!.id,
    author: '@mona',
    body: 'Closing: Yjs it is.',
    createdAt: t.comments.at(-1)!.createdAt,
  });
  assert.equal(rp.fixture.exchanges.at(-1)!.res.status, 304);
});

test('offline: writes queue and apply locally, creates fail fast, the queue drains in order on reconnect', async () => {
  const rp = replay('github-offline.json');
  const r = await offlineFlow(adapter(rp.fetch), { offline() {} });
  rp.done();
  assert.equal(r.offline.state, 'offline');
  assert.equal(r.offline.queued, 2);
  assert.equal(r.cached.tickets[0].comments.at(-1)?.body, 'Queued while offline.');
  assert.equal(r.cached.tickets[0].assignee, 'claude-07');
  assert.equal(r.createError, 'offline');
  assert.equal(r.stillOffline.queued, 2);
  assert.deepEqual([r.online.state, r.online.queued, r.online.error], ['online', 0, undefined]);
  assert.equal(r.fresh.tickets[0].comments.at(-1)?.body, 'Queued while offline.');
  assert.equal(r.fresh.tickets[0].assignee, 'claude-07');
});

test('rate limits: short secondary limits retry in place; a primary limit queues until reset', async () => {
  const rp = replay('github-ratelimit.json');
  const r = await rateLimitFlow(adapter(rp.fetch), { limit() {} });
  rp.done();
  assert.equal(r.afterShort.state, 'online');
  assert.equal(r.limited.state, 'rate-limited');
  assert.equal(r.limited.queued, 1);
  assert.equal(r.limited.resetAt, (Math.floor(FROZEN / 1000) + 1800) * 1000);
  assert.deepEqual([r.resumed.state, r.resumed.queued], ['online', 0]);
  assert.deepEqual(
    r.fresh.tickets[0].comments.map((c) => c.body),
    ['Retried after a secondary limit.', 'Sent after the window reset.'],
  );
});

test('live recording (api.github.com): test connection, empty trail list, ETag polling', async () => {
  const rp = replay('github-live-read.json');
  assert.equal(rp.fixture.source, 'live');
  const result = await testGitHub({ repo: 'teamtrailhq/teamtrail', token: 'test-token', fetch: rp.fetch, retries: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.target, 'teamtrailhq/teamtrail');
  assert.equal(result.account, undefined, 'app installation tokens have no user; the test still passes');
  assert.equal(result.canWrite, false);
  assert.ok(result.rate?.limit);
  const a = adapter(rp.fetch, 'teamtrailhq/teamtrail')();
  assert.deepEqual(await a.listMaps(), []);
  a.subscribe(() => {});
  await a.tick();
  await a.tick();
  rp.done();
  assert.equal(a.status.state, 'online');
});

test('test connection explains failures instead of throwing', async () => {
  const notFound = async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  const r = await testGitHub({ repo: 'octo-org/missing', token: 't', fetch: notFound as typeof fetch });
  assert.deepEqual([r.ok, r.code], [false, 'not_found']);
  assert.match(r.error!, /not found/i);
  const down = async () => {
    throw new TypeError('fetch failed');
  };
  assert.equal((await testGitHub({ repo: 'a/b', token: 't', fetch: down as typeof fetch })).code, 'offline');
  assert.equal((await testGitHub({ repo: 'nope', token: 't' })).code, 'invalid');
});
