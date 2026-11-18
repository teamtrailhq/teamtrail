// GitHub and Linear show what the tracker holds: changes are never lost between polls, writes never overwrite a
// teammate's edit from the cache, and a claim is decided by the tracker, not by one process's cache.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authoredBody, ticketBody } from '../src/adapters/remote/format';
import { GitHubAdapter } from '../src/adapters/remote/github';
import { LinearAdapter } from '../src/adapters/remote/linear';
import type { AcceptedEntry } from '../src/adapters/remote/settingsInForce';
import type { AcceptedStore } from '../src/adapters/remote/settingsLedger';
import { ARCHIVED_LABEL } from '../src/model/brand';
import { confirmTrackerSettings } from '../src/planning/lifecycle/confirmTrackerSettings';
import { chartMap } from '../src/planning/operations/chart';
import { claim } from '../src/planning/operations/claims';
import { fakeGitHub } from './fakes/github';
import { fakeLinear } from './fakes/linear';

const SECTIONS = { destination: 'Ship it.', notes: '', decisions: [], unspecified: [], outOfScope: [] };
type Fake = ReturnType<typeof fakeGitHub>;
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const newest = (gh: Fake) => Math.max(...[...gh.issues.values()].map((i) => Date.parse(i.updated_at)));

function sharedStore(): AcceptedStore {
  const all: Record<string, AcceptedEntry> = {};
  return {
    read: () => structuredClone(all),
    async update(change) {
      for (const [id, e] of Object.entries(change(structuredClone(all)))) {
        if (e) all[id] = e;
        else delete all[id];
      }
      return true;
    },
  };
}

const gh = (fake: Fake, extra: Record<string, unknown> = {}) =>
  new GitHubAdapter({ repo: fake.repo, token: 't', fetch: fake.fetch, manual: true, sleep: async () => {}, ...extra });

async function trail(a: GitHubAdapter | LinearAdapter, title = 'Trail A') {
  return chartMap(a, {
    title,
    sections: SECTIONS,
    tickets: [
      { ref: 'a', title: 'First', type: 'task', body: 'Do a.' },
      { ref: 'b', title: 'Second', type: 'task', body: 'Do b.' },
    ],
  });
}

const stateOf = async (a: GitHubAdapter | LinearAdapter, mapId: string, ticketId: string) =>
  (await a.loadMap(mapId)).tickets.find((t) => t.id === ticketId)?.state;

/** A fetch that fails while `down` is set and `match` says so. */
function flaky(inner: typeof fetch, match: (url: string) => boolean) {
  const net = { down: false };
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    if (net.down && match(String(input))) throw new TypeError('fetch failed');
    return inner(input, init);
  };
  return { fetch: fetchFn as typeof fetch, net };
}

test('a change in the same second as the last one seen still shows', async () => {
  const fake = fakeGitHub();
  const a = gh(fake);
  const { map, tickets } = await trail(a);
  a.subscribe(() => {});
  await a.tick();
  await a.tick();
  const i = fake.issues.get(Number(tickets[1].id))!;
  const t = iso(newest(fake));
  Object.assign(i, { state: 'closed', state_reason: 'completed', closed_at: t, updated_at: t });
  await a.tick();
  assert.equal(await stateOf(a, map.id, tickets[1].id), 'closed');
});

test('more changes between polls than one page holds: everything cached is read again', async () => {
  const fake = fakeGitHub();
  const a = gh(fake);
  const { map, tickets } = await trail(a);
  a.subscribe(() => {});
  await a.tick();
  fake.human.close(Number(tickets[0].id));
  for (let k = 0; k < 105; k++) fake.human.seed({ title: `unrelated ${k}`, body: '', labels: [] });
  await a.tick();
  assert.equal(await stateOf(a, map.id, tickets[0].id), 'closed');
});

test('a trail archived or renamed in GitHub shows in the trail list at once', async () => {
  const fake = fakeGitHub();
  const a = gh(fake);
  const { map } = await trail(a);
  const events: string[] = [];
  a.subscribe((e) => events.push(e.kind));
  await a.listMaps();
  await a.tick();
  const root = fake.issues.get(Number(map.id))!;
  root.labels.push(ARCHIVED_LABEL);
  root.title = 'Renamed by mona';
  root.updated_at = iso(newest(fake) + 5000);
  await a.tick();
  const [listed] = await a.listMaps();
  assert.deepEqual([listed.title, listed.archived], ['Renamed by mona', true]);
  assert.ok(events.includes('external.changed'));
});

test('a failed refetch keeps the trail pending: the change shows once the tracker answers again', async () => {
  const fake = fakeGitHub();
  const net = flaky(fake.fetch, (url) => url.includes('graphql'));
  const a = gh(fake, { fetch: net.fetch });
  const A = await trail(a, 'Trail A');
  const B = await trail(a, 'Trail B');
  a.subscribe(() => {});
  await a.tick();
  fake.human.close(Number(A.tickets[0].id));
  fake.human.close(Number(B.tickets[0].id));
  net.net.down = true;
  await a.tick();
  assert.equal(a.status.state, 'offline');
  net.net.down = false;
  await a.tick();
  assert.equal(await stateOf(a, A.map.id, A.tickets[0].id), 'closed');
  assert.equal(await stateOf(a, B.map.id, B.tickets[0].id), 'closed');
  assert.equal(a.status.state, 'online');
});

test('a trail that stops being one leaves the list; the other changed trails still sync', async () => {
  const fake = fakeGitHub();
  const a = gh(fake);
  const A = await trail(a, 'Trail A');
  const B = await trail(a, 'Trail B');
  a.subscribe(() => {});
  await a.listMaps();
  await a.tick();
  fake.human.close(Number(B.tickets[0].id));
  const rootA = fake.issues.get(Number(A.map.id))!;
  rootA.labels = rootA.labels.filter((l) => !l.endsWith(':map'));
  rootA.updated_at = iso(newest(fake) + 1000);
  await a.tick();
  assert.equal(await stateOf(a, B.map.id, B.tickets[0].id), 'closed');
  assert.deepEqual(
    (await a.listMaps()).map((m) => m.title),
    ['Trail B'],
  );
  assert.equal(a.status.error, undefined);
});

test("a claim is laid over the issue as GitHub has it: a teammate's edit since the last poll stays", async () => {
  const fake = fakeGitHub({ team: ['mona'] });
  const a = gh(fake);
  const { map, tickets } = await trail(a);
  a.subscribe(() => {});
  await a.tick();
  const n = Number(tickets[0].id);
  fake.human.editBody(n, 'mona', `${fake.issues.get(n)!.body}\n\nAcceptance: must work offline (added by mona).`);
  await a.assign(map.id, tickets[0].id, 'claude-07');
  assert.match(fake.issues.get(n)!.body ?? '', /added by mona/);
  const t = (await a.loadMap(map.id)).tickets[0];
  assert.equal(t.assignee, 'claude-07');
  assert.match(t.body, /added by mona/, 'the cache shows the edit at once');
});

test("an offline drain is laid over the issue as GitHub has it, and a claim made meanwhile isn't overwritten", async () => {
  const fake = fakeGitHub({ team: ['mona'] });
  const net = flaky(fake.fetch, () => true);
  const a = gh(fake, { fetch: net.fetch });
  const { map, tickets } = await trail(a);
  a.subscribe(() => {});
  await a.tick();
  net.net.down = true;
  await a.setMeta(map.id, tickets[0].id, { status: 'verifying' });
  await a.assign(map.id, tickets[1].id, 'claude-07');
  const n0 = Number(tickets[0].id);
  fake.human.editBody(n0, 'mona', `${fake.issues.get(n0)!.body}\n\nNote from mona.`);
  const t1 = (await gh(fake).loadMap(map.id)).tickets[1];
  fake.human.editBody(Number(tickets[1].id), 'mona', ticketBody({ ...t1, assignee: 'codex-02' }));
  net.net.down = false;
  await a.tick();
  assert.match(fake.issues.get(n0)!.body ?? '', /Note from mona/);
  const after = await a.loadMap(map.id);
  assert.equal(after.tickets[0].status, 'verifying');
  assert.equal(after.tickets[1].assignee, 'codex-02', "mona's claim stands");
  assert.match(a.status.dropped?.[0]?.error ?? '', /claimed by codex-02/);
});

test('two processes claim the same ticket: only one wins', async () => {
  const fake = fakeGitHub();
  const { map, tickets } = await trail(gh(fake));
  const a = gh(fake);
  const b = gh(fake);
  a.subscribe(() => {});
  b.subscribe(() => {});
  await a.loadMap(map.id);
  await b.loadMap(map.id);
  const outcome = (p: Promise<unknown>) =>
    p.then(
      () => 'won',
      (e: Error) => e.message,
    );
  const ra = await outcome(claim(a, map.id, tickets[0].id, { assignee: 'claude-01', settleMs: 0 }));
  const rb = await outcome(claim(b, map.id, tickets[0].id, { assignee: 'codex-02', settleMs: 0 }));
  assert.equal(ra, 'won');
  assert.match(rb, /claimed by claude-01/);
  assert.equal((await gh(fake).loadMap(map.id)).tickets[0].assignee, 'claude-01');
});

test('a write the tracker refuses for good is dropped, shown, and its trail read again', async () => {
  const fake = fakeGitHub();
  const net = flaky(fake.fetch, () => true);
  const a = gh(fake, { fetch: net.fetch });
  const { map, tickets } = await trail(a);
  a.subscribe(() => {});
  await a.tick();
  net.net.down = true;
  await a.comment(map.id, tickets[0].id, 'claude-07', 'Taking this.');
  const n = Number(tickets[0].id);
  fake.issues.delete(n);
  const root = fake.issues.get(Number(map.id))!;
  root.subIssues = root.subIssues.filter((x) => x !== n);
  root.updated_at = iso(newest(fake) + 1000);
  net.net.down = false;
  await a.tick();
  await a.tick();
  assert.equal((await a.loadMap(map.id)).tickets.length, 1, 'the deleted ticket is gone');
  assert.equal(a.status.dropped?.length, 1, 'the refused write is still listed after later successes');
});

test('every trail is read again every few minutes: a teammate who lost access stops counting', async () => {
  const fake = fakeGitHub({ team: ['mona'] });
  let clock = Date.now();
  const a = gh(fake, { now: () => clock });
  const { map, tickets } = await trail(a);
  fake.human.comment(Number(tickets[0].id), 'mona', authoredBody('claude-09', 'Taking this.'));
  a.subscribe(() => {});
  await a.tick();
  assert.equal((await a.loadMap(map.id)).tickets[0].comments.at(-1)!.author, 'claude-09 (@mona)');
  fake.human.revoke('mona');
  clock += 60 * 60_000;
  await a.tick();
  assert.equal((await a.loadMap(map.id)).tickets[0].comments.at(-1)!.author, '@mona');
});

test('accepting settings clears settingsUnconfirmed here and in every other process', async () => {
  const fake = fakeGitHub({ team: ['mona'] });
  const creator = gh(fake);
  const { map, tickets } = await trail(creator);
  const t0 = (await creator.loadMap(map.id)).tickets[0];
  fake.human.editBody(Number(tickets[0].id), 'mona', ticketBody({ ...t0, verification: 'checks' }));
  const store = sharedStore();
  const lookout = gh(fake, { accepted: store });
  const mcp = gh(fake, { accepted: store });
  mcp.subscribe(() => {});
  await mcp.tick();
  assert.equal((await mcp.loadMap(map.id)).tickets[0].settingsUnconfirmed, true);
  assert.equal((await lookout.loadMap(map.id)).tickets[0].settingsUnconfirmed, true);
  await confirmTrackerSettings(lookout, {
    root: '/nonexistent',
    mapId: map.id,
    issueId: tickets[0].id,
    choice: 'as-is',
  });
  assert.equal((await lookout.loadMap(map.id)).tickets[0].settingsUnconfirmed, undefined, 'this process');
  await mcp.tick();
  assert.equal((await mcp.loadMap(map.id)).tickets[0].settingsUnconfirmed, undefined, 'another process');
  assert.equal(lookout.unacceptedSettings().length, 0);
});

const linear = (fake: ReturnType<typeof fakeLinear>, extra: Record<string, unknown> = {}) =>
  new LinearAdapter({
    apiKey: 'k',
    teamId: 'team-eng',
    fetch: fake.fetch,
    manual: true,
    sleep: async () => {},
    ...extra,
  });

test("Linear: the first cursor is Linear's own, so a clock running ahead misses nothing", async () => {
  const fake = fakeLinear();
  const a = linear(fake, { now: () => Date.now() + 24 * 60 * 60_000 });
  const { map, tickets } = await trail(a);
  a.subscribe(() => {});
  await a.tick();
  fake.human.complete(tickets[0].id);
  await a.tick();
  assert.equal(await stateOf(a, map.id, tickets[0].id), 'closed');
});

test('Linear: a trail archived or deleted in Linear shows in the trail list', async () => {
  const fake = fakeLinear();
  let clock = Date.now();
  const a = linear(fake, { now: () => clock });
  const A = await trail(a, 'Trail A');
  const B = await trail(a, 'Trail B');
  a.subscribe(() => {});
  await a.listMaps();
  await a.tick();
  assert.equal((await a.listMaps()).length, 2);
  await linear(fake).setMapArchived(A.map.id, true);
  await a.tick();
  assert.equal((await a.listMaps()).find((m) => m.id === A.map.id)?.archived, true);
  fake.issues.delete(B.map.id);
  // nothing lists a deleted issue as changed: the periodic full read finds it gone
  clock += 10 * 60_000;
  await a.tick();
  assert.deepEqual(
    (await a.listMaps()).map((m) => m.id),
    [A.map.id],
  );
});
