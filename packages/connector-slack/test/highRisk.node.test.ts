/**
 * High-risk calls are answered in the Lookout only. Slack answers reach this machine through Teamtrail's Scout
 * service, so a question the risk policy makes high risk, or a completion that touched high-risk files, shows
 * "Open in Lookout" in Slack instead of answer buttons, and a click on an old button is refused.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ANA, agentDoc, connected, freezeTime, liveWorld, until } from './harness';
import { approvalTrail, eventStore, posted } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = Record<string, any>;
const buttonsOf = (m: Msg) =>
  (m.blocks as Msg[]).filter((b) => b.type === 'actions').flatMap((b) => b.elements.map((e: Msg) => e.text.text));
const contextOf = (m: Msg) =>
  (m.blocks as Msg[]).filter((b) => b.type === 'context').map((b) => b.elements[0].text as string);

test('a question asked with a high-risk category: Open in Lookout, no answer buttons; an old button is refused', async () => {
  const l = liveWorld();
  const { w, calls, replies, fake } = l;
  try {
    const { a, map, db } = await eventStore();
    connected(w);
    const svc = w.service(a);
    await until(() => svc.status().state === 'online');
    const q = (id: string, category?: 'schema' | 'product-behaviour') => ({
      id,
      ticketId: db.id,
      text: `${id}: Postgres or SQLite?`,
      suggestions: ['Postgres'],
      at: Date.now(),
      ...(category ? { category } : {}),
    });
    agentDoc(w.root, { sid: 's1', mapId: map.id, ticketId: db.id, pending: [q('q1', 'schema')] });
    agentDoc(w.root, { sid: 's2', mapId: map.id, ticketId: db.id, pending: [q('q2', 'product-behaviour')] });
    await svc.tick();
    const [high, medium] = calls('chat.postMessage').filter((m) => m.blocks);
    assert.deepEqual(buttonsOf(high), ['Open in Lookout']);
    assert.match(contextOf(high).join(' '), /High risk: answer this in the Lookout/);
    assert.deepEqual(
      buttonsOf(medium),
      ['Postgres', 'Reply…', 'Open in Teamtrail'],
      'medium risk is answered in Slack',
    );

    // A button on a message posted before the policy made it high risk: the click is refused.
    const [channel, ts] = posted(fake, 'Awaiting you · claude-07: q2');
    const click = fake.payload.click(ANA, channel, ts, 'ask_option:0');
    const stale = {
      ...click.payload,
      actions: [{ ...(click.payload.actions as Msg[])[0], value: JSON.stringify({ s: 's1', q: 'q1', i: 0 }) }],
    };
    await w.send(svc, 'ana clicks an old answer button on the high-risk question', () => ({
      type: 'interactive',
      payload: stale,
    }));
    assert.equal(existsSync(path.join(w.root, '.agents', 'answers', 's1', 'q1.json')), false, 'no answer was written');
    assert.match(replies().at(-1)!.text, /High risk: answer this in the Lookout/);
  } finally {
    w.cleanup();
  }
});

test('a completion that touched high-risk files: Open in Lookout, no Approve; an Approve click is refused', async () => {
  const l = liveWorld();
  const { w, calls, replies, fake } = l;
  try {
    const { a, map, api } = await approvalTrail(w, { changed: ['db/migrations/0042_events.sql'] });
    connected(w);
    const svc = w.service(a);
    await until(() => svc.status().state === 'online');
    await svc.tick();
    const [approve, held] = calls('chat.postMessage').filter((m) => m.blocks);
    assert.deepEqual(buttonsOf(approve), ['Open in Lookout']);
    assert.match(contextOf(approve).join(' '), /High risk/);
    assert.deepEqual(
      buttonsOf(held),
      ['Rework…', 'Open in Teamtrail'],
      'a held ticket without risky files keeps its buttons',
    );

    const [channel, ts] = posted(fake, 'Held');
    const click = fake.payload.click(ANA, channel, ts, 'verify_rework');
    const forged = {
      ...click.payload,
      actions: [
        {
          ...(click.payload.actions as Msg[])[0],
          action_id: 'verify_approve',
          value: JSON.stringify({ m: map.id, t: api.id, a: 'A-1' }),
        },
      ],
    };
    await w.send(svc, 'an Approve click for the high-risk completion', () => ({
      type: 'interactive',
      payload: forged,
    }));
    assert.equal((await a.loadMap(map.id)).tickets.find((t) => t.id === api.id)!.state, 'open', 'not approved');
    assert.match(replies().at(-1)!.text, /High risk: answer this in the Lookout/);
  } finally {
    w.cleanup();
  }
});
