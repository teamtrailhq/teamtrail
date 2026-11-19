import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import type { TrackerAdapter } from '../src/adapters/adapter';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { GitHubAdapter } from '../src/adapters/remote/github';
import { outboxFile, outboxKey } from '../src/adapters/remote/outboxFile';
import { readLease, readLeases, writeLease } from '../src/agents/leaseStore';
import { reclaimExpired, returnToQueue } from '../src/agents/returnToQueue';
import { isHandoff, leaseHealth, type TicketLease } from '../src/agents/ticketLease';
import { createTrackerBridge } from '../src/bridge';
import { chartMap } from '../src/planning/operations/chart';
import { fakeGitHub } from './fakes/github';
import { faulty } from './fixtures';
import { noSleep } from './scenarios';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

async function charted(a: TrackerAdapter) {
  const { map, tickets } = await chartMap(a, {
    title: 'Leases',
    sections: SECTIONS,
    tickets: [{ ref: 'r', title: 'Survey options', type: 'research', body: 'Compare.' }],
  });
  await a.assign(map.id, tickets[0].id, 'claude-07');
  return { mapId: map.id, t: tickets[0] };
}

function lease(mapId: string, ticketId: string, o: Partial<TicketLease> = {}): TicketLease {
  const now = Date.now();
  return {
    v: 1,
    mapId,
    ticketId,
    ticketKey: `#${ticketId}`,
    agent: 'claude-07',
    pid: 999_999,
    claimedAt: now - 20 * 60_000,
    renewedAt: now - 16 * 60_000,
    ttlMs: 15 * 60_000,
    expiresAt: now - 60_000,
    notes: ['read the sync module', 'Yjs and Automerge both fit'],
    decisions: ['D-1 · Keep the outbox per tracker'],
    ...o,
  };
}

const markdown = (root: string) => new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);

test('health: live, stalled in the last third, then expired', () => {
  const l = { ttlMs: 900, expiresAt: 1000 };
  assert.deepEqual([leaseHealth(l, 0), leaseHealth(l, 800), leaseHealth(l, 1000)], ['live', 'stalled', 'expired']);
});

test('an expired lease returns the ticket to the queue with a handoff comment, exactly once', async () => {
  const root = tempFolder('teamtrail-lease-');
  const a = markdown(root);
  const { mapId, t } = await charted(a);
  writeLease(root, lease(mapId, t.id));

  const [r1, r2] = await Promise.all([reclaimExpired(root, a), reclaimExpired(root, a)]);
  assert.equal(r1.length + r2.length, 1, 'two reapers, one return');
  const after = (await a.loadMap(mapId)).tickets.find((x) => x.id === t.id)!;
  assert.equal(after.assignee, undefined);
  const handoff = after.comments.filter((c) => isHandoff(c.body));
  assert.equal(handoff.length, 1);
  assert.match(handoff[0].body, /claude-07 went silent/);
  assert.match(handoff[0].body, /- Yjs and Automerge both fit/);
  assert.match(handoff[0].body, /D-1 · Keep the outbox per tracker/);
  assert.deepEqual(readLease(root, mapId, t.id)?.returned?.reason, 'expired');
  assert.deepEqual(await reclaimExpired(root, a), [], 'a tombstone is not returned again');
});

test('a live lease stays; a lease on a ticket closed or reassigned meanwhile is only dropped', async () => {
  const root = tempFolder('teamtrail-lease-');
  const a = markdown(root);
  const { mapId, t } = await charted(a);
  writeLease(root, lease(mapId, t.id, { expiresAt: Date.now() + 60_000 }));
  assert.deepEqual(await reclaimExpired(root, a), []);
  assert.equal((await a.loadMap(mapId)).tickets[0].assignee, 'claude-07');

  await a.assign(mapId, t.id, 'trail lead');
  writeLease(root, lease(mapId, t.id));
  assert.deepEqual(await reclaimExpired(root, a), []);
  assert.equal(readLease(root, mapId, t.id), undefined);
  assert.equal((await a.loadMap(mapId)).tickets[0].assignee, 'trail lead');
});

test('github offline: the return is queued in the outbox and syncs once back online', async () => {
  const root = tempFolder('teamtrail-lease-gh-');
  const fake = fakeGitHub({ repo: 'octo-org/launchpad' });
  const net = faulty(fake.fetch);
  const opts = { repo: 'octo-org/launchpad', token: 't', manual: true, retries: 0, ...noSleep };
  const a = new GitHubAdapter({ ...opts, fetch: net.fetch, outbox: outboxFile(root, outboxKey('github', opts.repo)) });
  const { mapId, t } = await charted(a);
  await a.tick();
  writeLease(root, lease(mapId, t.id));

  net.state.fault = 'offline';
  assert.equal((await reclaimExpired(root, a)).length, 1);
  assert.equal((await a.loadMap(mapId)).tickets[0].assignee, undefined, 'shown released right away');
  assert.equal(a.status.queued, 2, 'handoff comment + unassign wait in the outbox');

  net.state.fault = undefined;
  await a.tick();
  assert.equal(a.status.queued, 0);
  const remote = (await new GitHubAdapter({ ...opts, fetch: fake.fetch }).loadMap(mapId)).tickets[0];
  assert.equal(remote.assignee, undefined);
  assert.equal(remote.comments.filter((c) => isHandoff(c.body)).length, 1);
  a.dispose();
});

test('bridge: lists leases and releases one for the trail lead', async () => {
  const root = tempFolder('teamtrail-lease-br-');
  const bridge = createTrackerBridge(root, { env: {}, configDir: path.join(root, 'cfg'), leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const { mapId, t } = await charted(markdown(root));
    writeLease(root, lease(mapId, t.id, { expiresAt: Date.now() + 60_000 }));
    const listed = (await (await fetch(`${base}/agents/leases`)).json()) as { leases: TicketLease[] };
    assert.deepEqual(
      listed.leases.map((l) => l.ticketId),
      [t.id],
    );
    const rel = await fetch(`${base}/agents/leases/release`, {
      method: 'POST',
      body: JSON.stringify({ mapId, ticketId: t.id }),
    });
    assert.equal(rel.status, 200);
    const back = (await markdown(root).loadMap(mapId)).tickets[0];
    assert.equal(back.assignee, undefined);
    assert.match(back.comments.at(-1)!.body, /released by trail lead/);
    assert.equal(readLeases(root)[0].returned?.reason, 'trail lead');
    const again = await fetch(`${base}/agents/leases/release`, {
      method: 'POST',
      body: JSON.stringify({ mapId, ticketId: t.id }),
    });
    assert.equal(again.status, 404);
    assert.deepEqual(
      readdirSync(path.join(root, '.agents/leases')).filter((n) => !n.endsWith('.json')),
      [],
      'no half-taken lease left behind',
    );
  } finally {
    bridge.close();
    server.close();
  }
});

test('operator release of a lease another process is returning reports busy', async () => {
  const root = tempFolder('teamtrail-lease-');
  const a = markdown(root);
  const { mapId, t } = await charted(a);
  const l = lease(mapId, t.id);
  writeLease(root, l);
  const [x, y] = await Promise.all([
    returnToQueue(root, a, l, { reason: 'trail lead', by: 'trail lead' }),
    returnToQueue(root, a, l, { reason: 'expired', by: 'teamtrail' }),
  ]);
  assert.equal([x, y].filter((r) => 'returned' in r).length, 1);
  assert.equal([x, y].filter((r) => 'busy' in r).length, 1);
});
