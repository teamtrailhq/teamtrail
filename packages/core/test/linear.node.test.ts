import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { LinearAdapter, testLinear } from '../src/adapters/remote/linear';
import { replay } from './fixtures';
import { freezeTime, lateTrailFlow, trailFlow, noSleep, syncFlow } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

const adapter = (fetch: typeof globalThis.fetch) => () =>
  new LinearAdapter({ apiKey: 'lin_api_test', teamId: 'team-eng', fetch, manual: true, ...noSleep });

test('trail flow: parent issue, sub-issues, "blocks" relations, states and decision comments round-trip through Linear', async () => {
  const rp = replay('linear-flow.json');
  const r = await trailFlow(adapter(rp.fetch));
  rp.done();
  assert.deepEqual(r.before, []);
  assert.equal(r.maps.length, 1);
  assert.match(r.map.key, /^ENG-\d+$/);
  assert.equal(r.snap.map.mode, 'plan-only');
  const [research, junction] = r.snap.tickets;
  assert.equal(research.state, 'closed');
  assert.equal(research.closeReason, 'completed');
  assert.equal(research.assignee, 'claude-07');
  assert.deepEqual(
    research.comments.map((c) => c.author),
    ['claude-07', 'claude-07'],
  );
  assert.deepEqual(junction.blockedBy, [research.id]);
  const d = Object.fromEntries(r.decisions.map((x) => [x.id, x]));
  assert.equal(d['D-1'].supersededBy, 'D-2');
  assert.equal(d['D-2'].ticketKey, research.key);
  assert.deepEqual(r.snap.map.sections.decisions, [
    { ticketKey: research.key, text: 'Use Automerge. Its history model fits the audit trail.' },
  ]);

  const create = rp.fixture.exchanges.find(
    (e) => e.req.operation === 'Create' && (e.req.variables as { input: { parentId?: string } }).input.parentId,
  );
  assert.ok(create, 'tickets are created as sub-issues');
  const close = rp.fixture.exchanges.find(
    (e) => e.req.operation === 'Update' && (e.req.variables as { input: { stateId?: string } }).input.stateId,
  );
  assert.equal(
    (close!.req.variables as { input: { stateId: string } }).input.stateId,
    'st-done',
    'first "completed" workflow state',
  );
});

test('trails charted by another process show up on the next poll, including before the first one', async () => {
  const rp = replay('linear-late-trail.json');
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

test('sync: a teammate completing and commenting in Linear reaches subscribers', async () => {
  const rp = replay('linear-sync.json');
  const r = await syncFlow(adapter(rp.fetch), { act() {} });
  rp.done();
  assert.deepEqual(
    r.seen.map((e) => e.kind),
    ['external.changed'],
  );
  assert.equal(r.idle, 0);
  assert.equal(r.after.tickets[0].state, 'closed');
  assert.equal(r.after.tickets[0].comments.at(-1)?.author, 'Grace (@grace)');
});

test('live recording (api.linear.app): an invalid key is reported as an auth problem', async () => {
  const rp = replay('linear-live-auth.json');
  assert.equal(rp.fixture.source, 'live');
  const r = await testLinear({ apiKey: 'lin_api_invalid_key_for_recording', fetch: rp.fetch });
  rp.done();
  assert.deepEqual([r.ok, r.code], [false, 'auth']);
});

test('Linear RATELIMITED errors surface as rate_limited with the reset time', async () => {
  const reset = Date.now() + 3_600_000;
  const limited = async () =>
    new Response(
      JSON.stringify({ errors: [{ message: 'Rate limit exceeded', extensions: { code: 'RATELIMITED' } }] }),
      { status: 400, headers: { 'x-ratelimit-requests-reset': String(reset) } },
    );
  const a = new LinearAdapter({
    apiKey: 'lin_api_test',
    teamId: 'team-eng',
    fetch: limited as typeof fetch,
    manual: true,
    ...noSleep,
  });
  await assert.rejects(
    a.listMaps(),
    (e: Error & { code?: string; resetAt?: number }) => e.code === 'rate_limited' && e.resetAt === reset,
  );
  assert.equal(a.status.state, 'rate-limited');
});
