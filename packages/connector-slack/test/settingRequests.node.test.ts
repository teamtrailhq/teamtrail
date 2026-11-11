/**
 * An agent's request to change one of the trail lead's settings reaches Slack as a card with Approve and Decline.
 * Only the confirmed owner's clicks count; approving is bound to the request as the card showed it; nothing changes
 * until they approve, and an approval is kept as their decision, via Slack.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { journalFile, proposeReroute, readReroute, writeReroute } from '@teamtrail/core/agents';
import { ANA, EVE, connected, freezeTime, liveWorld, readJson, until } from './harness';
import { eventStore } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

const REFUSED = /^Only the Teamtrail owner and allowed users can do that/;

async function requested() {
  const l = liveWorld();
  const { a, map } = await eventStore();
  connected(l.w, { notify: { target: 'C0INFRA01', events: ['awaiting'], detail: 'full' } });
  const svc = l.w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  const env = { root: l.w.root, adapter: a, journal: journalFile(l.w.root) };
  const ask = (mode: 'plan-only' | 'plan+execute', why: string) =>
    proposeReroute(env, {
      mapId: map.id,
      kind: 'reroute',
      lane: 'setting',
      reason: `Switch the trail to ${mode}`,
      evidence: why,
      invalidates: [],
      changes: [{ op: 'set_mode', mode }],
      by: 'claude-07',
    });
  const r = await ask('plan-only', 'Only planning <!channel> this week');
  await svc.tick();
  const posted = () => readJson(path.join(l.w.root, '.agents', 'slack-settings.json')).posted;
  const card = posted()[`${map.id}/${r.proposal.id}`] as { channel: string; ts: string };
  return { ...l, svc, a, map, env, id: r.proposal.id, card, posted };
}

test('a setting request is a card: escaped, Approve and Decline, nothing changed yet', async () => {
  const { w, calls, map, a, id } = await requested();
  try {
    const [msg] = calls('chat.postMessage');
    const text = JSON.stringify(msg.blocks);
    assert.match(text, /claude-07 asks to switch the trail to plan-only/);
    assert.match(text, /Nothing changes until you approve/);
    assert.doesNotMatch(text, /<!channel>/, 'agent text is escaped');
    assert.deepEqual(
      msg.blocks
        .at(-1)
        .elements.map((e: { text: { text: string } }) => e.text.text)
        .slice(0, 2),
      ['Approve', 'Decline'],
    );
    assert.equal((await a.loadMap(map.id)).map.mode, 'plan+execute');
    assert.equal(readReroute(w.root, map.id, id)?.status, 'pending');
  } finally {
    w.cleanup();
  }
});

test('Approve by someone who is not the owner is refused, and changes nothing', async () => {
  const { w, svc, card, replies, a, map, id } = await requested();
  try {
    await w.send(svc, 'eve presses Approve', (f) => f.payload.click(EVE, card.channel, card.ts, 'setting_approve'));
    assert.match(replies().at(-1)!.text, REFUSED);
    assert.equal(readReroute(w.root, map.id, id)?.status, 'pending');
    assert.equal((await a.loadMap(map.id)).map.mode, 'plan+execute');
  } finally {
    w.cleanup();
  }
});

test('the owner approves: applied, journaled, kept as their decision via Slack, and the card closes', async () => {
  const { w, svc, card, calls, a, map, id } = await requested();
  try {
    await w.send(svc, 'ana presses Approve', (f) => f.payload.click(ANA, card.channel, card.ts, 'setting_approve'));
    await until(() => readReroute(w.root, map.id, id)?.status === 'approved', 'approved');
    assert.equal((await a.loadMap(map.id)).map.mode, 'plan-only');
    const [rec] = (await a.listDecisions(map.id)).filter((d) => d.question.includes('asks to'));
    assert.equal(rec.decidedBy, `slack:${ANA}`);
    assert.equal(rec.source.kind, 'slack');
    assert.match(JSON.stringify(calls('chat.update').at(-1)), /Approved by <@U0ANA0001> via Slack/);
  } finally {
    w.cleanup();
  }
});

test('the owner declines: nothing changes, and the agent gets the note', async () => {
  const { w, svc, card, a, map, id } = await requested();
  try {
    await w.send(svc, 'ana presses Decline', (f) => f.payload.click(ANA, card.channel, card.ts, 'setting_decline'));
    await until(() => readReroute(w.root, map.id, id)?.status === 'rejected', 'declined');
    assert.equal(readReroute(w.root, map.id, id)?.note, 'Declined in Slack.');
    assert.equal((await a.loadMap(map.id)).map.mode, 'plan+execute');
  } finally {
    w.cleanup();
  }
});

test('a request changed since the card was posted is not approved from it', async () => {
  const { w, svc, card, replies, map, id } = await requested();
  try {
    const p = readReroute(w.root, map.id, id)!;
    writeReroute(w.root, { ...p, changes: [{ op: 'set_mode', mode: 'plan+execute' }] });
    await w.send(svc, 'ana presses Approve', (f) => f.payload.click(ANA, card.channel, card.ts, 'setting_approve'));
    await until(() => replies().length > 0, 'reply');
    assert.match(replies().at(-1)!.text, /out of date/);
    assert.equal(readReroute(w.root, map.id, id)?.status, 'pending');
  } finally {
    w.cleanup();
  }
});
