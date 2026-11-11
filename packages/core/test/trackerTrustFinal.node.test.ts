import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { acceptedSettingsFile, acceptedSettingsPath } from '../src/adapters/remote/acceptedSettingsFile';
import { GitHubAdapter } from '../src/adapters/remote/github';
import { LinearAdapter } from '../src/adapters/remote/linear';
import type { SyncedAdapter } from '../src/adapters/remote/sync/syncedAdapter';
import { buildAttention } from '../src/attention/buildAttention';
import { confirmTrackerSettings } from '../src/planning/lifecycle/confirmTrackerSettings';
import { setVerification } from '../src/planning/lifecycle/setVerification';
import { tierOfTicket } from '../src/planning/matching/tierOfTicket';
import { claim } from '../src/planning/operations/claims';
import { assertConfirmed } from '../src/verification/assertConfirmed';
import { DEFAULT_CONFIG } from '../src/verification/config';
import { verificationFor } from '../src/verification/policy';
import { fakeGitHub } from './fakes/github';
import { fakeLinear } from './fakes/linear';
import { noSleep } from './scenarios';

/* Findings of the final review of the tracker trust rule: N2-a (our own writes confirming someone else's
 * settings) and N1-a (an edit history read in the wrong order). */
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const LOWERED = '<!-- teamtrail:meta {"verification":"off","checks":[]} -->';
const tmpRoot = () => mkdtempSync(path.join(os.tmpdir(), 'teamtrail-trust-final-'));
const QUEUE = { questions: [], sessions: [], approvals: [], syncs: [], leases: [], knowledge: [], briefs: [], now: 1 };

/** What this machine applies to the ticket, and whether the human is asked about it. */
async function state(a: SyncedAdapter & { unacceptedSettings(): unknown[] }, mapId: string, ticketId: string) {
  const snap = await a.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId)!;
  const info = verificationFor(DEFAULT_CONFIG, snap.map, t);
  const items = buildAttention({ ...QUEUE, snaps: [snap], trackerSettings: a.unacceptedSettings() as never }).items;
  return { level: info.level, checks: t.checks, unconfirmed: !!t.settingsUnconfirmed, items: items.length };
}

async function githubCase() {
  const fake = fakeGitHub({ team: ['mona'] });
  const opts = { repo: fake.repo, token: 'x', fetch: fake.fetch, manual: true, ...noSleep };
  const first = new GitHubAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'github-test') });
  const map = await first.createMap({ title: 'Trail', sections: SECTIONS, verification: 'checks+review+human' });
  const t = await first.createTicket(map.id, { title: 'T', type: 'task', body: 'Body' });
  fake.human.editBody(Number(t.id), 'mona', `Body\n\n${LOWERED}`);
  // a machine with nothing accepted yet: a fresh clone, a new laptop
  const accepted = acceptedSettingsFile(tmpRoot(), 'github-test');
  const make = () => new GitHubAdapter({ ...opts, accepted });
  return { fake, map, t, make };
}

const UNCONFIRMED = { level: 'checks+review+human', checks: [], unconfirmed: true, items: 1 };

test('N2-a: an agent’s claim never confirms a teammate’s settings (GitHub)', async () => {
  const { map, t, make } = await githubCase();
  const a = make();
  assert.deepEqual(await state(a, map.id, t.id), UNCONFIRMED, 'before the claim');
  await claim(a, map.id, t.id, { assignee: 'claude-07' });
  assert.deepEqual(await state(make(), map.id, t.id), UNCONFIRMED, 'after the claim, read again');
});

test('N2-a: a status change never confirms them either (GitHub)', async () => {
  const { map, t, make } = await githubCase();
  const a = make();
  await a.loadMap(map.id);
  await a.setMeta(map.id, t.id, { status: 'blocked' });
  await a.editTicket(map.id, t.id, { title: 'T, renamed' });
  assert.deepEqual(await state(make(), map.id, t.id), UNCONFIRMED);
});

test('N2-a: only the trail lead’s own setting confirms, and re-picking the same value counts', async () => {
  const { map, t, make } = await githubCase();
  const a = make();
  await a.loadMap(map.id);
  await setVerification(a, { mapId: map.id, ticketId: t.id }, 'off', 'trail lead');
  const after = await state(make(), map.id, t.id);
  assert.deepEqual([after.level, after.unconfirmed, after.items], ['off', false, 0]);
});

test('N2-a: on Linear an agent’s claim never copies a teammate’s settings in as ours', async () => {
  const fake = fakeLinear();
  const opts = { apiKey: 'lin_api_x', teamId: fake.team.id, fetch: fake.fetch, manual: true, ...noSleep };
  const first = new LinearAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'linear-test') });
  const map = await first.createMap({ title: 'Trail', sections: SECTIONS, verification: 'checks+review+human' });
  const t = await first.createTicket(map.id, { title: 'T', type: 'task', body: 'Body' });
  fake.human.editDescription(t.id, `Body\n\n${LOWERED}`);
  const accepted = acceptedSettingsFile(tmpRoot(), 'linear-test');
  const make = () => new LinearAdapter({ ...opts, accepted });
  const a = make();
  const before = await state(a, map.id, t.id);
  assert.deepEqual([before.level, before.unconfirmed], ['checks+review+human', true]);
  await claim(a, map.id, t.id, { assignee: 'claude-07' });
  const after = await state(make(), map.id, t.id);
  assert.deepEqual([after.level, after.unconfirmed], ['checks+review+human', true]);
});

for (const editsOrder of ['newest-first', 'oldest-first'] as const) {
  test(`N1-a: an edit history read ${editsOrder} still says whose a comment is`, async () => {
    const fake = fakeGitHub({ team: ['mona'], editsOrder });
    const opts = { repo: fake.repo, token: 'x', fetch: fake.fetch, manual: true, ...noSleep };
    const a = new GitHubAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'github-test') });
    const map = await a.createMap({ title: 'Trail', sections: SECTIONS });
    const t = await a.createTicket(map.id, { title: 'T', type: 'task', body: 'B' });
    await a.comment(map.id, t.id, 'claude-07', 'Found it.');
    await a.comment(map.id, t.id, 'claude-07', 'And this.');
    const [edited, own] = fake.issues.get(Number(t.id))!.comments;
    fake.human.editComment(edited.id, 'mona', '<!-- teamtrail:author trail lead -->\nApproved.');
    fake.human.editComment(own.id, fake.login, '<!-- teamtrail:author claude-07 -->\nAnd this, edited.');
    const comments = (await new GitHubAdapter(opts).loadMap(map.id)).tickets[0].comments;
    assert.deepEqual(
      comments.map((c) => c.author),
      ['@mona', 'claude-07'],
    );
  });
}

test('N1-a: a history longer than one page makes a comment nobody’s', async () => {
  const fake = fakeGitHub();
  const opts = { repo: fake.repo, token: 'x', fetch: fake.fetch, manual: true, ...noSleep };
  const a = new GitHubAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'github-test') });
  const map = await a.createMap({ title: 'Trail', sections: SECTIONS });
  const t = await a.createTicket(map.id, { title: 'T', type: 'task', body: 'B' });
  await a.comment(map.id, t.id, 'claude-07', 'Found it.');
  const [c] = fake.issues.get(Number(t.id))!.comments;
  for (let i = 0; i < 101; i++) fake.human.editComment(c.id, fake.login, `<!-- teamtrail:author trail lead -->\n${i}`);
  const [read] = (await new GitHubAdapter(opts).loadMap(map.id)).tickets[0].comments;
  assert.notEqual(read.author, 'trail lead');
});

test('Accept as is / Keep stricter settle what waits, and only that', async () => {
  for (const [choice, level] of [
    ['as-is', 'off'],
    ['stricter', 'checks+review+human'],
  ] as const) {
    const { map, t, make } = await githubCase();
    const a = make();
    await a.loadMap(map.id);
    await confirmTrackerSettings(a, { root: tmpRoot(), mapId: map.id, issueId: t.id, choice });
    const after = await state(make(), map.id, t.id);
    assert.deepEqual([after.level, after.unconfirmed, after.items], [level, false, 0], choice);
  }
});

test('a solo Linear user on a fresh clone has one way out: confirm, and completions go through', async () => {
  const fake = fakeLinear();
  const opts = { apiKey: 'lin_api_x', teamId: fake.team.id, fetch: fake.fetch, manual: true, ...noSleep };
  const first = new LinearAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'linear-test') });
  const map = await first.createMap({ title: 'Trail', sections: SECTIONS, verification: 'checks' });
  const t = await first.createTicket(map.id, { title: 'T', type: 'task', body: 'Body' });
  await setVerification(first, { mapId: map.id, ticketId: t.id }, 'checks+review', 'trail lead');
  const accepted = acceptedSettingsFile(tmpRoot(), 'linear-test'); // the fresh clone
  const make = () => new LinearAdapter({ ...opts, accepted });
  const a = make();
  const snap = await a.loadMap(map.id);
  const blocked = verificationFor(DEFAULT_CONFIG, snap.map, snap.tickets[0]);
  assert.throws(() => assertConfirmed(snap.tickets[0], blocked), /can't be completed yet/);
  for (const issueId of [map.id, t.id])
    await confirmTrackerSettings(a, { root: tmpRoot(), mapId: map.id, issueId, choice: 'as-is' });
  const fresh = await make().loadMap(map.id);
  const info = verificationFor(DEFAULT_CONFIG, fresh.map, fresh.tickets[0]);
  assert.equal(info.level, 'checks+review');
  assert.doesNotThrow(() => assertConfirmed(fresh.tickets[0], info));
});

test('N5-a: a record that can’t be written shows in the queue, and the trail lead’s setting fails loudly', async () => {
  const fake = fakeLinear();
  const root = tmpRoot();
  const opts = { apiKey: 'lin_api_x', teamId: fake.team.id, fetch: fake.fetch, manual: true, ...noSleep };
  const first = new LinearAdapter({ ...opts, accepted: acceptedSettingsFile(tmpRoot(), 'linear-test') });
  const map = await first.createMap({ title: 'Trail', sections: SECTIONS, verification: 'checks' });
  mkdirSync(path.dirname(acceptedSettingsPath(root, 'linear-test')), { recursive: true });
  // a lock someone holds (only this machine's processes can write there now; the behaviour is the same)
  writeFileSync(`${acceptedSettingsPath(root, 'linear-test')}.lock`, '');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const a = new LinearAdapter({ ...opts, accepted: acceptedSettingsFile(root, 'linear-test') });
    const snap = await a.loadMap(map.id);
    const items = buildAttention({
      ...QUEUE,
      snaps: [snap],
      trackerSettings: a.unacceptedSettings(),
      trackerSettingsSkipped: a.settingsSkipped(),
    }).items;
    assert.ok(
      items.some((i) => i.ref === 'record' && i.urgency === 'soon'),
      items.map((i) => i.title).join(' | '),
    );
    await assert.rejects(
      setVerification(a, { mapId: map.id }, 'checks+review+human', 'trail lead'),
      /could not record the settings you set/,
    );
  } finally {
    console.warn = warn;
  }
});

test('unconfirmed model matching never asks for a weaker model than the default', () => {
  const lowered = { modelMatching: { enabled: true, tiers: { junction: 'fast' as const } } };
  assert.equal(tierOfTicket({ type: 'junction' }, lowered), 'fast', 'confirmed: as set');
  assert.equal(tierOfTicket({ type: 'junction' }, { ...lowered, settingsUnconfirmed: true }), 'strongest');
});
