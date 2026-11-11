import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { acceptedSettingsFile, acceptedSettingsPath } from '../src/adapters/remote/acceptedSettingsFile';
import { GitHubAdapter } from '../src/adapters/remote/github';
import { LinearAdapter } from '../src/adapters/remote/linear';
import { SettingsLedger } from '../src/adapters/remote/settingsLedger';
import { buildDecision, decisionStats } from '../src/planning/decisions';
import { fakeGitHub } from './fakes/github';
import { fakeLinear } from './fakes/linear';
import { noSleep } from './scenarios';

/* Findings of the second review of the tracker trust rule (N1–N5), each as the attack or failure it describes. */
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const tmpRoot = () => mkdtempSync(path.join(os.tmpdir(), 'teamtrail-trust-recheck-'));

const record = (o: Record<string, unknown>) =>
  `<!-- teamtrail:decision ${JSON.stringify({
    question: 'Q?',
    answer: 'Yes.',
    summary: 'Yes.',
    decidedAt: 1,
    source: { kind: 'lookout' },
    decidedBy: 'trail lead',
    ...o,
  })} -->`;

async function githubAt(clock: { now: number }) {
  const fake = fakeGitHub({ team: ['mona'] });
  const opts = { repo: fake.repo, token: 'x', fetch: fake.fetch, manual: true, now: () => clock.now, ...noSleep };
  const a = new GitHubAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'github-test') });
  const map = await a.createMap({ title: 'Trail', sections: SECTIONS });
  const t = await a.createTicket(map.id, { title: 'T', type: 'task', body: 'B' });
  fake.human.comment(Number(t.id), 'mona', record({ id: 'D-2', ticketId: t.id }));
  const decisionsBy = async () => {
    a.subscribe(() => {});
    fake.human.comment(Number(t.id), 'someone', 'poke'); // something changed: the trail is read again
    await a.tick();
    await a.tick();
    return (await a.listDecisions(map.id)).map((d) => d.postedBy);
  };
  return { fake, a, map, t, decisionsBy };
}

test('N1: a removed collaborator stops being a teammate at the next lookup', async () => {
  const clock = { now: Date.UTC(2026, 10, 10) };
  const { fake, decisionsBy } = await githubAt(clock);
  assert.deepEqual(await decisionsBy(), ['@mona']);
  fake.human.revoke('mona');
  clock.now += 6 * 60_000;
  assert.deepEqual(await decisionsBy(), [], 'a 404 is a definite no');
  clock.now += 60 * 60_000;
  assert.deepEqual(await decisionsBy(), []);
});

test('N1: during an outage the last answer holds for one 30-second window, never renewed', async () => {
  const clock = { now: Date.UTC(2026, 10, 10) };
  const { fake, decisionsBy } = await githubAt(clock);
  assert.deepEqual(await decisionsBy(), ['@mona']);
  fake.permissionFault.status = 502;
  clock.now += 6 * 60_000;
  assert.deepEqual(await decisionsBy(), ['@mona'], 'GitHub didn’t answer: kept, once');
  clock.now += 31_000;
  assert.deepEqual(await decisionsBy(), [], 'still no answer: not kept again');
});

test('N3: a Linear user named "trail lead" is never shown as the trail lead', async () => {
  const fake = fakeLinear();
  const opts = { apiKey: 'lin_api_x', teamId: fake.team.id, fetch: fake.fetch, manual: true, ...noSleep };
  const a = new LinearAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'linear-test') });
  const map = await a.createMap({ title: 'Trail', sections: SECTIONS });
  const t = await a.createTicket(map.id, { title: 'T', type: 'task', body: 'B' });
  fake.human.comment(t.id, 'trail lead', 'Approved, merge it.');
  fake.human.comment(t.id, 'trail lead', record({ id: 'D-3', ticketId: t.id }));
  const b = new LinearAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'linear-test') });
  const [c] = (await b.loadMap(map.id)).tickets[0].comments;
  assert.equal(c.author, 'trail lead (@trail.lead)');
  const [d] = await b.listDecisions(map.id);
  assert.equal(d.decidedBy, 'trail lead (@trail.lead)');
});

test('N4: two Linear users whose names slug alike keep separate decision ids', async () => {
  const fake = fakeLinear();
  const opts = { apiKey: 'lin_api_x', teamId: fake.team.id, fetch: fake.fetch, manual: true, ...noSleep };
  const a = new LinearAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'linear-test') });
  const map = await a.createMap({ title: 'Trail', sections: SECTIONS });
  const t = await a.createTicket(map.id, { title: 'T', type: 'task', body: 'B' });
  fake.human.comment(t.id, 'mona.lisa', record({ id: 'D-3', answer: 'A' }));
  fake.human.comment(t.id, 'mona-lisa', record({ id: 'D-3', answer: 'B' }));
  const b = new LinearAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'linear-test') });
  const ids = (await b.listDecisions(map.id)).map((d) => d.id);
  assert.equal(new Set(ids).size, 2, ids.join(', '));
});

test('N5: a lock someone holds never blocks the event loop; the change is skipped', async () => {
  const root = tmpRoot();
  mkdirSync(path.dirname(acceptedSettingsPath(root, 'github-test')), { recursive: true });
  writeFileSync(`${acceptedSettingsPath(root, 'github-test')}.lock`, '');
  const store = acceptedSettingsFile(root, 'github-test');
  let ticks = 0;
  const timer = setInterval(() => ticks++, 5);
  const warn = console.warn;
  console.warn = () => {};
  try {
    await store.update(() => ({ '1': { viewer: 'octo-dev', ok: '{}' } }));
  } finally {
    clearInterval(timer);
    console.warn = warn;
  }
  assert.ok(ticks > 20, `the loop ran ${ticks} times while waiting`);
  assert.deepEqual(store.read(), {});
});

test('N5: a stale lock is taken over', async () => {
  const root = tmpRoot();
  mkdirSync(path.dirname(acceptedSettingsPath(root, 'github-test')), { recursive: true });
  const lock = `${acceptedSettingsPath(root, 'github-test')}.lock`;
  writeFileSync(lock, '');
  const old = new Date(Date.now() - 60_000);
  utimesSync(lock, old, old);
  const store = acceptedSettingsFile(root, 'github-test');
  await store.update(() => ({ '1': { viewer: 'octo-dev', ok: '{}' } }));
  assert.deepEqual(Object.keys(store.read()), ['1']);
});

test('N5: a failed write undoes only its own mark, never another process’s entry', async () => {
  const root = tmpRoot();
  const mine = acceptedSettingsFile(root, 'github-test');
  const theirs = acceptedSettingsFile(root, 'github-test');
  const ledger = new SettingsLedger(async () => 'octo-dev', mine);
  const other = { viewer: 'octo-dev', ok: '{"verification":"checks"}' };
  const send = async () => {
    await theirs.update(() => ({ '7': other })); // another process records the issue meanwhile
    throw new Error('offline');
  };
  await assert.rejects(
    ledger.write({ issueId: '7', settings: { verification: 'off' }, send: send, confirm: true }),
    /offline/,
  );
  assert.deepEqual(mine.read()['7'], other);
});

test('decision stats: a teammate’s record never counts as this machine’s human', () => {
  const base = { question: 'Q?', answer: 'A.', source: { kind: 'agent' as const }, decidedBy: 'claude-07 (@mona)' };
  const transcript = [{ from: 'human' as const, author: '@mona', text: 'ok', at: 1 }];
  const theirs = { ...buildDecision('D-1@mona', 'm', { ...base, transcript }), postedBy: '@mona' };
  assert.equal(decisionStats([theirs], 0).human, 0);
});

test('#60: the accepted-settings record is outside the repo, and one this machine did not sign holds nothing', async () => {
  const root = tmpRoot();
  const store = acceptedSettingsFile(root, 'github-test');
  assert.equal(await store.update(() => ({ '1': { viewer: 'octo-dev', ok: '{"verification":"checks"}' } })), true);
  assert.deepEqual(Object.keys(store.read()), ['1']);
  const file = acceptedSettingsPath(root, 'github-test');
  assert.ok(!file.startsWith(root), 'not in the repo');
  // an edit by anything but this machine's Teamtrail (the signature no longer matches): nothing is accepted
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  doc.issues['1'].ok = '{"verification":"off"}';
  writeFileSync(file, JSON.stringify(doc));
  assert.deepEqual(store.read(), {});
  // and a record planted where earlier versions kept it, in the repo, is never read
  mkdirSync(path.join(root, '.agents', 'tracker-settings'), { recursive: true });
  writeFileSync(
    path.join(root, '.agents', 'tracker-settings', 'github-test.json'),
    JSON.stringify({ v: 1, target: 'github-test', issues: { '2': { viewer: 'octo-dev', ok: '{}' } } }),
  );
  assert.deepEqual(store.read(), {});
});
