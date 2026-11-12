/**
 * Interrupt gating with real attention scores. From the live test: an agent asked a high-risk question without
 * waiting, then an ordinary one it waited on; both landed in the digest, so the second never got its buttons.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { agentDoc, connected, freezeTime, liveWorld, until } from './harness';
import { eventStore } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

async function setup() {
  const l = liveWorld();
  const { a, map } = await eventStore();
  connected(l.w, { notify: { target: 'dm', events: ['awaiting'], detail: 'full' } });
  const svc = l.w.service(a, { interruptOnly: true });
  await until(() => svc.status().state === 'online');
  const own = () => l.calls('chat.postMessage').filter((m) => m.blocks);
  const digests = () => l.calls('chat.postMessage').filter((m) => !m.blocks);
  return { ...l, svc, map, own, digests };
}

const risky = { id: 'risky', text: 'Delete notes older than two years?', at: Date.now(), urgency: 'blocking' as const };
const plain = { id: 'plain', text: 'Include comments in the PDF?', at: Date.now() + 3, urgency: 'blocking' as const };

test('the question an agent waits on gets its own message, though the agent asked another one just before', async () => {
  const { w, svc, map, own, digests } = await setup();
  try {
    agentDoc(w.root, {
      sid: 's1',
      mapId: map.id,
      agent: 'claude-01',
      pending: [{ ...risky, category: 'data-deletion' }, plain],
      waitingOn: 'plain',
    });
    await svc.tick();
    assert.equal(own().length, 1, 'only the waited-on question is its own message');
    assert.match(own()[0].text, /Include comments in the PDF\?/);
    assert.match(digests()[0]?.text ?? '', /Delete notes older than two years\? \(answer in Teamtrail\)/);
  } finally {
    w.cleanup();
  }
});

test('a question first sent to the digest is posted once it interrupts, and only once', async () => {
  const { w, svc, map, own } = await setup();
  try {
    agentDoc(w.root, { sid: 's2', mapId: map.id, agent: 'claude-02', pending: [plain] });
    await svc.tick();
    assert.equal(own().length, 0, 'not waited on yet: 55 points, under the interrupt');
    agentDoc(w.root, { sid: 's2', mapId: map.id, agent: 'claude-02', pending: [plain], waitingOn: 'plain' });
    await svc.tick();
    assert.equal(own().length, 1, 'now the agent waits on it: posted with its buttons');
    await svc.tick();
    assert.equal(own().length, 1, 'never twice');
  } finally {
    w.cleanup();
  }
});

test('a high-risk question that interrupts is its own message, with Open in Lookout and no answer buttons', async () => {
  const { w, svc, map, own } = await setup();
  try {
    agentDoc(w.root, {
      sid: 's3',
      mapId: map.id,
      agent: 'claude-03',
      pending: [{ ...risky, category: 'data-deletion' }],
      waitingOn: 'risky',
    });
    await svc.tick();
    assert.equal(own().length, 1);
    const buttons = JSON.stringify(own()[0].blocks);
    assert.match(buttons, /Open in Lookout/);
    assert.doesNotMatch(buttons, /"action_id":"[^"]*answer/i);
  } finally {
    w.cleanup();
  }
});
