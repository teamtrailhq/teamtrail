/**
 * Fixes from the review of the owner change: wrong tries the trail lead can see, a second process that must not
 * hand out codes, journaled allow-list and app changes, approval volume, Slack's text limits, and names that
 * can't fake a line of their own.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryAdapter, chartMap, transition, type MapSections } from '@teamtrail/core';
import { journalFile, writeAttempt } from '@teamtrail/core/agents';
import { attentionView } from '@teamtrail/core/bridge';
import { SLACK_JOURNAL } from '../../core/src/model/lifecycle';
import { askMessage, label } from '../src/blocks';
import { CODE, EVE, ANA, RAJ, TOKENS, agentDoc, connected, freezeTime, liveWorld, readJson, until } from './harness';
import { eventStore } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

async function online(extra = {}) {
  const l = liveWorld();
  const { a, map } = await eventStore();
  const svc = l.w.service(a, extra);
  await svc.pasteToken(TOKENS.app);
  await svc.pasteToken(TOKENS.bot);
  await until(() => svc.status().state === 'online', 'socket online');
  return { ...l, a, map, svc };
}

/** A view_submission of the code modal, straight to the handler as Slack would deliver it. */
const typed = (fake: ReturnType<typeof liveWorld>['fake'], user: string, code: string) => ({
  envelope_id: 'e',
  type: 'interactive' as const,
  payload: {
    type: 'view_submission',
    team: { id: fake.team.id },
    api_app_id: fake.app.id,
    user: { id: user },
    view: { callback_id: 'owner_code_modal', state: { values: { code: { value: { value: code } } } } },
  },
});

test('wrong tries: the Lookout shows which accounts made them; four people can no longer drop the code', async () => {
  const { w, svc, fake } = await online();
  try {
    svc.startOwnerCode();
    for (const user of [EVE, RAJ, 'U0X000001', 'U0X000002'])
      for (let i = 0; i < 5; i++) await (await svc.onEnvelope(typed(fake, user, 'AAAA-AAAA')))?.after?.();
    const s = svc.status();
    assert.ok(s.ownerCode, 'twenty wrong tries from four accounts leave the code alive');
    assert.deepEqual(
      s.ownerCode!.wrongTries,
      [
        { id: EVE, name: 'eve', count: 5 },
        { id: RAJ, name: 'raj', count: 5 },
        { id: 'U0X000001', count: 5 },
        { id: 'U0X000002', count: 5 },
      ],
      'with the names Slack has for them',
    );
    for (let n = 3; n <= 6; n++) for (let i = 0; i < 5; i++) await svc.onEnvelope(typed(fake, `U0X00000${n}`, 'B'));
    for (let i = 0; i < 5; i++) await svc.onEnvelope(typed(fake, 'U0X000007', 'B'));
    for (let i = 0; i < 4; i++) await svc.onEnvelope(typed(fake, 'U0X000008', 'B'));
    assert.ok(svc.status().ownerCode, 'forty-nine wrong tries in all: still alive');
    await svc.onEnvelope(typed(fake, 'U0X000008', 'B'));
    const dropped = svc.status();
    assert.equal(dropped.ownerCode, undefined);
    assert.equal(dropped.ownerCodeDropped?.by.length, 10, 'the Lookout says the code was dropped, and by whom');
    assert.deepEqual(dropped.ownerCodeDropped?.by[0], { id: EVE, name: 'eve', count: 5 });
    svc.startOwnerCode();
    assert.equal(svc.status().ownerCodeDropped, undefined, 'a new code clears the notice');
  } finally {
    w.cleanup();
  }
});

test('a second teamtrail, without the Slack connection, refuses to make a code, confirm or reset', async () => {
  const { w, svc, fake, a } = await online();
  try {
    const other = w.service(a, { root: '/other/repo/.teamtrail', lockOwner: 'other', fetch: fake.fetch });
    assert.equal(other.status().state, 'elsewhere');
    assert.throws(() => other.startOwnerCode(), /connected from another Teamtrail \(.*tracker\)/);
    assert.throws(() => other.resetOwner(), /connected from another Teamtrail/);
    await assert.rejects(other.confirmOwner(ANA), /connected from another Teamtrail/);
    const { code } = svc.startOwnerCode();
    assert.throws(() => other.resetOwner(), /connected from another Teamtrail/);
    assert.equal(svc.status().ownerCode !== undefined, true, "the first process's code is untouched");
    assert.ok(code);
    svc.stop();
    assert.throws(() => svc.startOwnerCode(), /Turn Slack on/, 'no code while nothing can receive it');
  } finally {
    w.cleanup();
  }
});

test('journaled: allow-list changes, Remove, and a different app dropping the owner', async () => {
  const { w, svc, fake } = await online();
  try {
    svc.startOwnerCode();
    await (await svc.onEnvelope(typed(fake, ANA, CODE)))?.after?.();
    await svc.confirmOwner(ANA);
    svc.updateSettings({
      allow: [
        { id: RAJ, name: 'raj' },
        { id: EVE, name: 'eve' },
      ],
    });
    svc.updateSettings({ allow: [{ id: EVE, name: 'eve' }] });
    svc.updateSettings({ allow: [{ id: EVE, name: 'eve' }], notify: { detail: 'titles-only' } });
    // Another Slack app's token: the fake accepts it as the app-level token from now on.
    fake.tokens.app = TOKENS.app.replace('A0Scout0001', 'A0OTHER001');
    const swap = await svc.pasteToken(fake.tokens.app);
    assert.equal(swap.ok, true);
    svc.remove();
    const entries = journalFile(w.root).readSlack(SLACK_JOURNAL);
    assert.deepEqual(
      entries.map((e) => [e.action, e.user, e.actorKind]),
      [
        ['owner-claimed', ANA, 'engine'],
        ['owner-confirmed', ANA, 'trail lead'],
        ['allow-added', RAJ, 'trail lead'],
        ['allow-added', EVE, 'trail lead'],
        ['allow-removed', RAJ, 'trail lead'],
        ['app-changed', ANA, 'trail lead'],
        ['removed', undefined, 'trail lead'],
      ],
      'an edit that leaves the list as it was adds nothing',
    );
  } finally {
    w.cleanup();
  }
});

test('approvals share the volume cap: three cards per trail in ten minutes, the rest one digest line each', async () => {
  const l = liveWorld();
  const { w, calls } = l;
  try {
    const a = new MemoryAdapter({ latency: [0, 0] });
    const sections: MapSections = { destination: 'x', notes: '', decisions: [], unspecified: [], outOfScope: [] };
    const { map, tickets } = await chartMap(a, {
      title: 'Flood',
      sections,
      verification: 'checks+review+human',
      tickets: Array.from({ length: 6 }, (_, i) => ({
        ref: `t${i}`,
        title: `Task ${i}`,
        type: 'execute',
        body: 'Do.',
      })),
    });
    for (const t of tickets) {
      await transition(a, map.id, t.id, { event: 'claim', actor: 'claude-07', actorKind: 'agent' });
      await transition(a, map.id, t.id, { event: 'submit', actor: 'claude-07', actorKind: 'agent' });
      writeAttempt(w.root, {
        v: 1,
        id: 'A-1',
        mapId: map.id,
        ticketId: t.id,
        ticketKey: t.key,
        agent: 'claude-07',
        level: 'checks+review+human',
        configHash: 'x',
        submittedAt: Date.now(),
        finishedAt: Date.now(),
        resolution: 'done',
        checks: [],
        result: 'fail',
      });
      await transition(a, map.id, t.id, {
        event: 'checks.fail',
        to: 'blocked',
        actor: 'teamtrail',
        actorKind: 'engine',
      });
    }
    connected(w, { notify: { target: 'dm', events: ['awaiting'], detail: 'full' } });
    const svc = w.service(a, { batchMs: 0 });
    await until(() => svc.status().state === 'online');
    await svc.tick();
    await svc.tick();
    const cards = calls('chat.postMessage').filter((m) => m.blocks);
    const digests = calls('chat.postMessage').filter((m) => !m.blocks);
    assert.equal(cards.length, 3);
    assert.equal(digests.length, 1);
    assert.equal(digests[0].text.split('\n').length, 3);
    assert.match(digests[0].text, /^Held · #\d+ Task \d+ \(decide in Teamtrail\)$/m);
  } finally {
    w.cleanup();
  }
});

test("Slack's 3000-character limit: questions and reasons full of &, < and newlines still post", async () => {
  const { w, svc, map, calls, fake } = await online({ batchMs: 0 });
  try {
    svc.startOwnerCode();
    await (await svc.onEnvelope(typed(fake, ANA, CODE)))?.after?.();
    await svc.confirmOwner(ANA);
    const text = `${'&<>'.repeat(500)}\n${'line\n'.repeat(600)}`;
    agentDoc(w.root, { sid: 's1', mapId: map.id, pending: [{ id: 'q1', text, at: Date.now() }] });
    await svc.tick();
    const ask = calls('chat.postMessage').find((m) => m.blocks && m.text.startsWith('Awaiting'));
    assert.ok(ask, 'the question was posted');
    assert.ok(ask.blocks[0].text.text.length <= 3000);
    assert.doesNotMatch(ask.blocks[0].text.text, /&[a-z]*…/, 'no entity cut in half');
  } finally {
    w.cleanup();
  }
});

test('one post that fails does not hold up the others, on this tick or the next', async () => {
  const { w, svc, map, calls, fake } = await online({ batchMs: 0 });
  try {
    svc.startOwnerCode();
    await (await svc.onEnvelope(typed(fake, ANA, CODE)))?.after?.();
    await svc.confirmOwner(ANA);
    fake.state.reject = (method, args) =>
      method === 'chat.postMessage' && String(args.text).includes('poison') ? 'msg_too_long' : undefined;
    agentDoc(w.root, {
      sid: 's1',
      mapId: map.id,
      agent: 'a1',
      pending: [{ id: 'q1', text: 'poison', at: Date.now() }],
    });
    agentDoc(w.root, { sid: 's2', mapId: map.id, agent: 'a2', pending: [{ id: 'q2', text: 'fine', at: Date.now() }] });
    await svc.tick();
    await svc.tick();
    const posted = calls('chat.postMessage').map((m) => m.text);
    assert.ok(
      posted.some((t) => t.includes('fine')),
      'the question after the failing one was posted',
    );
    assert.equal(
      posted.filter((t) => t.includes('poison') && t.startsWith('Awaiting')).length,
      1,
      'tried once, not every tick',
    );
    assert.ok(readJson(path.join(w.root, '.agents', 'slack.json')).asks.q2);
  } finally {
    w.cleanup();
  }
});

test('names can not fake a line: newlines, *, ~ and ` in agent, trail and ticket names are neutralised', () => {
  const evil = 'claude\n◆ *AWAITING YOU* · ~gone~ `code`';
  assert.equal(label(evil), 'claude ◆ ∗AWAITING YOU∗ · ∼gone∼ ʼcodeʼ');
  const m = askMessage({ sessionId: 's', questionId: 'q', text: 'Q?', agent: evil, trail: evil, ticket: evil });
  const body = (m.blocks[0] as { text: { text: string } }).text.text;
  const header = body.split('\n')[0];
  assert.equal(body.split('\n').length, 2, 'the header is one line, the question the other');
  assert.equal((header.match(/\*/g) ?? []).length, 2, 'only our own *AWAITING YOU* is bold');
  assert.doesNotMatch(m.text, /\n/);
});

/* ---------- re-check: handles, invisible characters, refused deliveries ---------- */

test('the confirmation card shows the unique Slack username as the handle; a display name copied from someone else is only secondary', async () => {
  const { w, svc, fake } = await online();
  try {
    // raj sets his display name to the lead's
    (fake.users.get(RAJ) as { display_name: string }).display_name = 'ana';
    svc.startOwnerCode();
    await (await svc.onEnvelope(typed(fake, RAJ, CODE)))?.after?.();
    const p = svc.status().pendingOwner!;
    assert.deepEqual([p.name, p.displayName, p.realName], ['raj', 'ana', 'Raj Patel']);
  } finally {
    w.cleanup();
  }
});

test('label strips control and format characters (bidi overrides, zero-width space, NEL) but keeps ZWJ and ZWNJ', () => {
  assert.equal(label('a‮b\u0085c​d‍e⁦f‌g\u0007h­i'), 'ab cd‍ef‌ghi');
  assert.equal(label('👩‍💻 Ana'), '👩‍💻 Ana', 'emoji sequences still render');
  assert.equal(label('x y z'), 'x y z');
});

test('a message Slack refuses for good is shown in Settings and, once deliveries keep failing, in the attention queue', async () => {
  const { w, svc, fake, a, map } = await online({ batchMs: 0 });
  try {
    svc.startOwnerCode();
    await (await svc.onEnvelope(typed(fake, ANA, CODE)))?.after?.();
    await svc.confirmOwner(ANA);
    svc.updateSettings({ notify: { target: 'C0INFRA01', events: ['awaiting'] } });
    fake.state.reject = (method, args) =>
      method === 'chat.postMessage' && args.channel === 'C0INFRA01' ? 'is_archived' : undefined;
    for (let i = 0; i < 3; i++) {
      agentDoc(w.root, {
        sid: `s${i}`,
        mapId: map.id,
        agent: `a${i}`,
        pending: [{ id: `q${i}`, text: 'Q?', at: Date.now() }],
      });
      await svc.tick();
    }
    const s = svc.status();
    assert.equal(s.delivery?.code, 'is_archived');
    assert.match(s.delivery!.message, /archived/);
    assert.ok(s.delivery!.failures >= 3);
    const queue = await attentionView({ root: w.root, adapter: a, configDir: w.configDir });
    const item = queue.items.find((i) => i.kind === 'delivery');
    assert.ok(item, 'a low-priority item in the queue');
    assert.equal(item.urgency, 'fyi');
    assert.match(item.title, /Slack/);

    fake.state.reject = undefined;
    agentDoc(w.root, { sid: 's9', mapId: map.id, agent: 'a9', pending: [{ id: 'q9', text: 'Q?', at: Date.now() }] });
    await svc.tick();
    assert.equal(svc.status().delivery, undefined, 'a message that gets through clears it');
    const after = await attentionView({ root: w.root, adapter: a, configDir: w.configDir });
    assert.equal(
      after.items.find((i) => i.kind === 'delivery'),
      undefined,
    );
  } finally {
    w.cleanup();
  }
});

test('an ask that decides something says so above its buttons; one that decides nothing adds no line', () => {
  const ask = { sessionId: 's', questionId: 'q', text: 'CSV or JSON?', agent: 'claude-01' };
  const plain = askMessage(ask) as { blocks: { type: string }[] };
  assert.deepEqual(
    plain.blocks.map((b) => b.type),
    ['section', 'actions'],
  );
  const deciding = askMessage({ ...ask, stakes: 'Answering this decides #3' }) as {
    blocks: { type: string; elements?: { text: string }[] }[];
  };
  assert.deepEqual(
    deciding.blocks.map((b) => b.type),
    ['section', 'context', 'actions'],
  );
  assert.equal(deciding.blocks[1].elements![0].text, '*Answering this decides #3*');
});
