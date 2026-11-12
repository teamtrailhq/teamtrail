/**
 * Fixes from earlier reviews: journaled allow-list changes and disconnecting, approval volume, Slack's text limits,
 * names that can't fake a line of their own, and refused deliveries.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryAdapter, chartMap, transition, type MapSections } from '@teamtrail/core';
import { journalFile, writeAttempt } from '@teamtrail/core/agents';
import { attentionView } from '@teamtrail/core/bridge';
import { SLACK_JOURNAL } from '../../core/src/model/lifecycle';
import { askMessage, label } from '../src/blocks';
import { EVE, ANA, RAJ, agentDoc, connected, freezeTime, liveWorld, readJson, until } from './harness';
import { eventStore } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

/** Connected (ANA the owner) and online. */
async function online(extra = {}) {
  const l = liveWorld();
  const { a, map } = await eventStore();
  connected(l.w);
  const svc = l.w.service(a, extra);
  await until(() => svc.status().state === 'online', 'link online');
  return { ...l, a, map, svc };
}

test('journaled: allow-list changes and disconnecting', async () => {
  const l = liveWorld();
  const { w } = l;
  try {
    connected(w);
    const gone = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith('https://scout.test/')
        ? new Response(null, { status: 204 })
        : w.fetch(input, init)) as typeof fetch;
    const svc = w.service(new MemoryAdapter({ latency: [0, 0] }), { fetch: gone });
    await until(() => svc.status().state === 'online', 'link online');
    svc.updateSettings({
      allow: [
        { id: RAJ, name: 'raj' },
        { id: EVE, name: 'eve' },
      ],
    });
    svc.updateSettings({ allow: [{ id: EVE, name: 'eve' }] });
    svc.updateSettings({ allow: [{ id: EVE, name: 'eve' }], notify: { detail: 'titles-only' } });
    await svc.disconnect();
    const entries = journalFile(w.root).readSlack(SLACK_JOURNAL);
    assert.deepEqual(
      entries.map((e) => [e.action, e.user, e.actorKind]),
      [
        ['allow-added', RAJ, 'trail lead'],
        ['allow-added', EVE, 'trail lead'],
        ['allow-removed', RAJ, 'trail lead'],
        ['disconnected', ANA, 'trail lead'],
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
  const { w, svc, map, calls } = await online({ batchMs: 0 });
  try {
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

/* ---------- re-check: invisible characters, refused deliveries ---------- */

test('label strips control and format characters (bidi overrides, zero-width space, NEL) but keeps ZWJ and ZWNJ', () => {
  assert.equal(label('a‮b\u0085c​d‍e⁦f‌g\u0007h­i'), 'ab cd‍ef‌ghi');
  assert.equal(label('👩‍💻 Ana'), '👩‍💻 Ana', 'emoji sequences still render');
  assert.equal(label('x y z'), 'x y z');
});

test('a message Slack refuses for good is shown in Settings and, once deliveries keep failing, in the attention queue', async () => {
  const { w, svc, fake, a, map } = await online({ batchMs: 0 });
  try {
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
