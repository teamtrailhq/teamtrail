/**
 * Volume. An agent can call ask_human as often as it likes; each question used to become its own DM. Now one agent
 * gets three of its own messages in ten minutes, all agents ten; the rest go into the trail's batched digest.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ASKS_IN_TOTAL, ASKS_PER_AGENT, ASK_WINDOW_MS } from '../src/service/askLimit';
import { agentDoc, connected, freezeTime, liveWorld, until } from './harness';
import { eventStore } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

const asks = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, text: `Question ${prefix}${i}?`, at: Date.now() + i }));

async function setup() {
  let now = Date.now();
  const l = liveWorld();
  const { a, map } = await eventStore();
  connected(l.w, { notify: { target: 'dm', events: ['awaiting'], detail: 'full' } });
  const svc = l.w.service(a, { now: () => now, batchMs: 60_000 });
  await until(() => svc.status().state === 'online');
  const own = () => l.calls('chat.postMessage').filter((m) => m.blocks);
  const digests = () => l.calls('chat.postMessage').filter((m) => !m.blocks);
  return { ...l, svc, map, own, digests, advance: (ms: number) => (now += ms) };
}

test('one agent asking forty questions: three DMs, one digest message, and no more on later ticks', async () => {
  const { w, svc, map, own, digests, advance } = await setup();
  try {
    agentDoc(w.root, { sid: 'flood', mapId: map.id, agent: 'claude-07', pending: asks(40, 'q') });
    agentDoc(w.root, { sid: 'calm', mapId: map.id, agent: 'codex-02', pending: asks(1, 'c') });
    await svc.tick();
    await svc.tick();
    assert.equal(own().filter((m) => m.text.includes('claude-07')).length, ASKS_PER_AGENT);
    assert.equal(own().filter((m) => m.text.includes('codex-02')).length, 1, 'another agent is not crowded out');
    assert.equal(digests().length, 1, 'the other 37 are one message');
    const lines = digests()[0].text.split('\n');
    assert.equal(lines.length, 16);
    assert.match(lines[0], /^claude-07 asks: Question q\d+\? \(answer in Teamtrail\)$/);
    assert.equal(lines.at(-1), '…and 22 more in Teamtrail.');

    advance(30_000);
    await svc.tick();
    advance(ASK_WINDOW_MS);
    await svc.tick();
    assert.equal(own().length, ASKS_PER_AGENT + 1, 'questions past the limit never become DMs later');
    assert.equal(digests().length, 1);

    agentDoc(w.root, {
      sid: 'flood',
      mapId: map.id,
      agent: 'claude-07',
      pending: [...asks(40, 'q'), ...asks(1, 'later')],
    });
    await svc.tick();
    assert.equal(own().length, ASKS_PER_AGENT + 2, 'after the window a new question is its own message again');
  } finally {
    w.cleanup();
  }
});

test('many agents, or one under many names: ten DMs in ten minutes in all', async () => {
  const { w, svc, map, own, digests } = await setup();
  try {
    for (let i = 0; i < 8; i++)
      agentDoc(w.root, { sid: `s${i}`, mapId: map.id, agent: `agent-${i}`, pending: asks(2, `a${i}-`) });
    await svc.tick();
    assert.equal(own().length, ASKS_IN_TOTAL);
    assert.equal(digests().length, 1);
    assert.equal(digests()[0].text.split('\n').length, 6);
  } finally {
    w.cleanup();
  }
});
