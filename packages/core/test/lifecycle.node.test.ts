import assert from 'node:assert/strict';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import type { TrackerAdapter } from '../src/adapters/adapter';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { parseTicket, serializeTicket } from '../src/adapters/markdown/ticketFile';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { GitHubAdapter } from '../src/adapters/remote/github';
import { outboxFile, outboxKey } from '../src/adapters/remote/outboxFile';
import { writeLease } from '../src/agents/leaseStore';
import { reclaimExpired } from '../src/agents/returnToQueue';
import { createTrackerBridge } from '../src/bridge';
import { journalFile, journalPath } from '../src/history/journalFile';
import {
  TICKET_PHASES,
  type ActorKind,
  type LifecycleEvent,
  type TicketPhase,
  type TransitionEntry,
} from '../src/model/lifecycle';
import { ticketPhase } from '../src/planning/lifecycle/phase';
import { transition } from '../src/planning/lifecycle/transition';
import { TRANSITIONS } from '../src/planning/lifecycle/transitions';
import { chartMap } from '../src/planning/operations/chart';
import { claim, release } from '../src/planning/operations/claims';
import { resolve } from '../src/planning/operations/resolve';
import { fakeGitHub } from './fakes/github';
import { faulty } from './fixtures';
import { noSleep } from './scenarios';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

async function trail(a: TrackerAdapter) {
  const { map, tickets } = await chartMap(a, {
    title: 'Lifecycle',
    sections: SECTIONS,
    tickets: [
      { ref: 'a', title: 'First', type: 'execute', body: '' },
      { ref: 'b', title: 'Second', type: 'execute', body: '', blockedBy: ['a'] },
    ],
  });
  return { mapId: map.id, first: tickets[0], second: tickets[1] };
}

const memory = () => new MemoryAdapter({ latency: [0, 0] });

/** A fresh ticket put into `phase` with raw adapter writes (the setup a transition starts from). */
async function inPhase(phase: TicketPhase) {
  const a = memory();
  const { mapId, first, second } = await trail(a);
  const id = phase === 'backlog' ? second.id : first.id;
  if (phase === 'working') await a.assign(mapId, id, 'claude-07');
  if (phase === 'verifying' || phase === 'rework' || phase === 'blocked') await a.setMeta(mapId, id, { status: phase });
  if (phase === 'done') await a.close(mapId, id, 'completed');
  if (phase === 'cancelled') await a.close(mapId, id, 'not_planned');
  const snap = await a.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === id)!;
  assert.equal(ticketPhase(t, new Map(snap.tickets.map((x) => [x.id, x]))), phase, `setup for ${phase}`);
  return { a, mapId, id };
}

test('the transition table: every event from every phase is allowed exactly as listed, and lands where it says', async () => {
  for (const rule of TRANSITIONS) {
    for (const from of TICKET_PHASES) {
      for (const to of rule.to) {
        const { a, mapId, id } = await inPhase(from);
        const run = transition(a, mapId, id, { event: rule.event, actor: 'x', actorKind: rule.actors[0], to });
        if (!rule.from.includes(from)) {
          await assert.rejects(run, /needs/, `${rule.event} from ${from}`);
          continue;
        }
        const r = await run;
        const snap = await a.loadMap(mapId);
        const t = snap.tickets.find((x) => x.id === id)!;
        const phase = ticketPhase(t, new Map(snap.tickets.map((x) => [x.id, x])));
        assert.equal(r.to, to, `${rule.event} from ${from}`);
        assert.equal(phase, to, `${rule.event} from ${from} stores ${to}`);
      }
    }
  }
});

test('actor kinds are enforced, and a phase that moved meanwhile is refused (compare-and-set)', async () => {
  const kinds: ActorKind[] = ['agent', 'trail lead', 'engine'];
  for (const rule of TRANSITIONS) {
    for (const kind of kinds.filter((k) => !rule.actors.includes(k))) {
      const { a, mapId, id } = await inPhase(rule.from[0]);
      await assert.rejects(
        transition(a, mapId, id, { event: rule.event, actor: 'x', actorKind: kind, to: rule.to[0] }),
        /not for/,
      );
    }
  }
  const { a, mapId, id } = await inPhase('ready');
  await assert.rejects(
    transition(a, mapId, id, { event: 'claim', actor: 'x', actorKind: 'agent', expect: 'rework' }),
    /changed: it is ready now/,
  );
});

test('release and expiry go back to rework when the ticket was in rework, else to ready', async () => {
  const { a, mapId, id } = await inPhase('rework');
  await claim(a, mapId, id, { assignee: 'claude-07' });
  await release(a, mapId, id);
  const t = (await a.loadMap(mapId)).tickets.find((x) => x.id === id)!;
  assert.equal(t.status, 'rework');
  assert.equal(t.assignee, undefined);
});

test('operations record who, why and when; the journal is append-only JSONL and skips torn lines', async () => {
  const root = tempFolder('teamtrail-journal-');
  const journal = journalFile(root);
  const a = memory();
  const { mapId, first } = await trail(a);
  await claim(a, mapId, first.id, { assignee: 'claude-07', journal, sessionId: 's-1' });
  await resolve(a, mapId, first.id, { answer: 'Done it.', author: 'claude-07', journal });
  appendFileSync(journalPath(root, mapId), '{"v":1,"kind":"transi');
  const entries = journal.read(mapId);
  assert.deepEqual(
    entries.map((e) => [e.event, e.from, e.to, e.actor, e.actorKind]),
    [
      ['claim', 'ready', 'working', 'claude-07', 'agent'],
      ['complete', 'working', 'done', 'claude-07', 'agent'],
    ],
  );
  assert.equal(entries[0].sessionId, 's-1');
  assert.ok(entries.every((e) => e.at > 0 && e.ticketKey === first.key));
  assert.equal(readFileSync(path.join(root, '.events', '.gitignore'), 'utf8'), '*\n');
});

test('markdown: status is frontmatter written only when set, so existing ticket files stay byte-identical', async () => {
  const root = tempFolder('teamtrail-md-');
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { mapId, first } = await trail(a);
  const file = path.join(root, mapId, 'tickets', `${first.id}.md`);
  assert.ok(!readFileSync(file, 'utf8').includes('status:'));
  await a.setMeta(mapId, first.id, { status: 'rework' });
  assert.match(readFileSync(file, 'utf8'), /^status: rework$/m);
  assert.equal((await a.loadMap(mapId)).tickets[0].status, 'rework');
  await a.setMeta(mapId, first.id, { status: null });
  assert.ok(!readFileSync(file, 'utf8').includes('status:'));
  const t = parseTicket(readFileSync(file, 'utf8'));
  assert.equal(serializeTicket(t), readFileSync(file, 'utf8'));
  assert.equal(parseTicket(serializeTicket({ ...t, status: 'bogus' as never })).status, undefined);
});

test('github: claim and status share the meta marker, and neither write drops the other', async () => {
  const fake = fakeGitHub({ repo: 'octo-org/launchpad' });
  const opts = { repo: 'octo-org/launchpad', token: 't', manual: true, ...noSleep };
  const a = new GitHubAdapter({ ...opts, fetch: fake.fetch });
  const { mapId, first } = await trail(a);
  await a.setMeta(mapId, first.id, { status: 'rework' });
  await a.assign(mapId, first.id, 'claude-07');
  const body = fake.issues.get(Number(first.id))!.body!;
  assert.match(body, /<!-- teamtrail:meta \{"assignee":"claude-07","status":"rework"\} -->/);
  const fresh = (await new GitHubAdapter({ ...opts, fetch: fake.fetch }).loadMap(mapId)).tickets[0];
  assert.equal(fresh.status, 'rework');
  assert.equal(fresh.assignee, 'claude-07');
  assert.ok(!fresh.body.includes('teamtrail:meta'));
  a.dispose();
});

test('github offline: a status change waits in the outbox, shows at once, and lands once back online', async () => {
  const root = tempFolder('teamtrail-meta-gh-');
  const fake = fakeGitHub({ repo: 'octo-org/launchpad' });
  const net = faulty(fake.fetch);
  const opts = { repo: 'octo-org/launchpad', token: 't', manual: true, retries: 0, ...noSleep };
  const a = new GitHubAdapter({ ...opts, fetch: net.fetch, outbox: outboxFile(root, outboxKey('github', opts.repo)) });
  const { mapId, first } = await trail(a);
  await a.tick();
  net.state.fault = 'offline';
  await a.setMeta(mapId, first.id, { status: 'blocked' });
  assert.equal((await a.loadMap(mapId)).tickets[0].status, 'blocked');
  assert.equal(a.status.queued, 1);
  net.state.fault = undefined;
  await a.tick();
  assert.equal(a.status.queued, 0);
  assert.equal((await new GitHubAdapter({ ...opts, fetch: fake.fetch }).loadMap(mapId)).tickets[0].status, 'blocked');
  a.dispose();
});

test('the lease reaper returns a ticket through the lifecycle and journals it as the engine', async () => {
  const root = tempFolder('teamtrail-reap-');
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { mapId, first } = await trail(a);
  await a.assign(mapId, first.id, 'claude-07');
  const now = Date.now();
  writeLease(root, {
    v: 1,
    mapId,
    ticketId: first.id,
    ticketKey: first.key,
    agent: 'claude-07',
    sessionId: 's-9',
    pid: 999_999,
    claimedAt: now - 20 * 60_000,
    renewedAt: now - 16 * 60_000,
    ttlMs: 15 * 60_000,
    expiresAt: now - 60_000,
    notes: [],
    decisions: [],
  });
  assert.equal((await reclaimExpired(root, a)).length, 1);
  const [e] = journalFile(root).read(mapId);
  assert.deepEqual(
    [e.event, e.from, e.to, e.actor, e.actorKind, e.sessionId],
    ['expire', 'working', 'ready', 'teamtrail', 'engine', 's-9'],
  );
  assert.match(e.reason ?? '', /claude-07 went silent/);
});

test('bridge: the browser appends to the journal and reads a trail history; malformed entries are refused', async () => {
  const root = tempFolder('teamtrail-journal-br-');
  const bridge = createTrackerBridge(root, { env: {}, configDir: path.join(root, 'cfg'), leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const entry: TransitionEntry = {
    v: 1,
    kind: 'transition',
    at: Date.now(),
    mapId: 'm',
    ticketId: '3',
    ticketKey: '#3',
    event: 'claim' as LifecycleEvent,
    from: 'ready',
    to: 'working',
    actor: 'trail lead',
    actorKind: 'trail lead',
  };
  const post = (body: unknown) =>
    fetch(`${base}/journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post(entry)).status, 200);
    assert.equal((await post({ ...entry, to: 'nowhere' })).status, 400);
    assert.equal((await post({ ...entry, event: 'teleport' })).status, 400);
    const read = (await (await fetch(`${base}/journal?mapId=m`)).json()) as { entries: TransitionEntry[] };
    assert.deepEqual(read.entries, [entry]);
    assert.ok(existsSync(journalPath(root, 'm')));
  } finally {
    server.close();
    bridge.close();
  }
});
