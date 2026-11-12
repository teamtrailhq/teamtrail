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
    assert.match(replies().at(-1)!.text, /Could not approve: #\d+ is high risk: decide it in the Lookout/);
  } finally {
    w.cleanup();
  }
});

/** ANA owns Scout; claude-07 asked about #db with a high-risk category: #db is the Lookout's to decide. */
async function riskyTicket() {
  const l = liveWorld();
  const { a, map, db, retention } = await eventStore();
  connected(l.w);
  const svc = l.w.service(a);
  await until(() => svc.status().state === 'online');
  const q = {
    id: 'q1',
    ticketId: db.id,
    text: 'Drop the old events table?',
    category: 'schema' as const,
    at: Date.now(),
  };
  agentDoc(l.w.root, { sid: 's1', mapId: map.id, ticketId: db.id, pending: [q] });
  return { ...l, svc, a, map, db, retention };
}

test('attack: Save as decision can’t resolve a high-risk ticket from Slack; the modal doesn’t offer it', async () => {
  const { w, svc, a, map, db, retention, calls, replies, lastView } = await riskyTicket();
  try {
    await w.send(svc, 'ana runs /scout decide', (f) => f.payload.command(ANA, 'C0INFRA01', 'decide Keep the table'));
    const modal = calls('views.update').at(-1) ?? calls('views.open').at(-1)!;
    const offered = JSON.stringify(modal.view);
    assert.doesNotMatch(offered, new RegExp(`"value":"${db.id}"`), 'the high-risk ticket is not in the picker');
    assert.match(offered, new RegExp(`"value":"${retention.id}"`), 'the others are');
    // A forged submission naming it anyway (the modal's state comes from Slack, through the service).
    await w.send(svc, 'a submission that resolves the high-risk ticket', (f) => {
      const sub = f.payload.submit(ANA, lastView(), { decision: 'Drop it' });
      const view = sub.payload.view as Msg;
      view.private_metadata = JSON.stringify({ ...JSON.parse(view.private_metadata), mid: map.id });
      view.state.values.mode = { value: { selected_option: { value: 'resolve' } } };
      view.state.values.ticket = { value: { selected_option: { value: db.id } } };
      return sub;
    });
    const t = (await a.loadMap(map.id)).tickets.find((x) => x.id === db.id)!;
    assert.equal(t.state, 'open', 'not resolved');
    assert.deepEqual(await a.listDecisions(map.id), [], 'no decision recorded');
    assert.match(replies().at(-1)!.text, /Couldn't save the decision: #\d+ is high risk: decide it in the Lookout/);
  } finally {
    w.cleanup();
  }
});

test('attack: the reply modal can’t answer a high-risk question from Slack', async () => {
  const { w, svc, map } = await riskyTicket();
  try {
    const submitted = {
      type: 'interactive' as const,
      payload: {
        type: 'view_submission',
        team: { id: 'T0EFIKA01' },
        api_app_id: 'A0Scout0001',
        user: { id: ANA },
        view: {
          callback_id: 'ask_reply_modal',
          private_metadata: JSON.stringify({ s: 's1', q: 'q1' }),
          state: { values: { answer: { value: { value: 'Drop it' } } } },
        },
      },
    };
    const ack = await w.send(svc, 'a reply to the high-risk question', () => submitted);
    assert.match(JSON.stringify(ack), /High risk: answer this in the Lookout/);
    assert.equal(existsSync(path.join(w.root, '.agents', 'answers', 's1', 'q1.json')), false, 'no answer written');
    assert.ok(map);
  } finally {
    w.cleanup();
  }
});
