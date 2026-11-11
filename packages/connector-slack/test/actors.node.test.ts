/**
 * Who may act in Slack. Every way in (slash commands, the message shortcut, buttons, menus, modals, and messages
 * people write) is tried here by a workspace member who is neither the confirmed owner nor allowed by the trail lead.
 * In a shared channel that member sees Scout's messages and can press their buttons; nothing may come of it.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { readVerdicts } from '@teamtrail/core/agents';
import { ANA, EVE, RAJ, agentDoc, connected, freezeTime, liveWorld, readJson, until } from './harness';
import { approvalTrail, eventStore, posted } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

const REFUSED = /^Only the Teamtrail owner and allowed users can do that/;
type Ack = { text?: string; errors?: Record<string, string> } | undefined;

/** A trail with an open question, the owner confirmed, everything posted to a channel other members are in. */
async function shared(notify: Record<string, unknown> = { target: 'C0INFRA01', events: ['awaiting'], detail: 'full' }) {
  const l = liveWorld();
  const { a, map, db, second } = await eventStore();
  connected(l.w, { notify });
  const svc = l.w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  agentDoc(l.w.root, {
    sid: 's1',
    mapId: map.id,
    ticketId: db.id,
    pending: [
      { id: 'q1', ticketId: db.id, text: 'Postgres or SQLite?', suggestions: ['Postgres', 'SQLite'], at: Date.now() },
    ],
  });
  await svc.tick();
  const ask = readJson(path.join(l.w.root, '.agents', 'slack.json')).asks.q1 as { channel: string; ts: string };
  const answered = () => existsSync(path.join(l.w.root, '.agents', 'answers', 's1', 'q1.json'));
  return { ...l, svc, a, map, db, second, ask, answered };
}

test('slash commands from a non-owner: decide, status and inbox are refused and show nothing', async () => {
  const { w, svc, calls, replies } = await shared();
  try {
    for (const text of ['decide Use SQLite', 'status', 'status event', 'inbox', 'dance']) {
      const ack = (await w.send(svc, `eve runs /scout ${text}`, (f) =>
        f.payload.command(EVE, 'C0INFRA01', text),
      )) as Ack;
      assert.match(ack!.text!, REFUSED, text);
    }
    assert.equal(calls('views.open').length, 0, 'no decision modal');
    assert.deepEqual(replies(), [], 'no trip report or question was sent to them');
  } finally {
    w.cleanup();
  }
});

test('Save as decision from a non-owner: refused, no modal, the thread is not read', async () => {
  const { w, svc, fake, calls, replies } = await shared();
  try {
    const ts = fake.human.post('C0INFRA01', ANA, 'Use Postgres.');
    await w.send(svc, 'eve runs the shortcut', (f) => f.payload.shortcut(EVE, 'C0INFRA01', ts));
    assert.match(replies().at(-1)!.text, REFUSED);
    assert.equal(calls('views.open').length + calls('conversations.replies').length, 0);
  } finally {
    w.cleanup();
  }
});

test('an ask in a shared channel: another member presses a suggestion and Reply…; nothing is answered', async () => {
  const { w, svc, ask, answered, calls, replies } = await shared();
  try {
    assert.equal(ask.channel, 'C0INFRA01');
    for (const user of [EVE, RAJ]) {
      await w.send(svc, `${user} presses Postgres`, (f) => f.payload.click(user, ask.channel, ask.ts, 'ask_option:0'));
      await w.send(svc, `${user} presses Reply…`, (f) => f.payload.click(user, ask.channel, ask.ts, 'ask_reply'));
    }
    assert.equal(replies().length, 4);
    assert.ok(replies().every((r) => REFUSED.test(r.text) && r.response_type === 'ephemeral'));
    assert.equal(calls('views.open').length, 0);
    assert.equal(answered(), false);
  } finally {
    w.cleanup();
  }
});

test('the Reply… modal submitted by a non-owner: refused; submitted by the owner: recorded under the id Slack gave', async () => {
  const { w, svc, ask, answered, lastView } = await shared();
  try {
    await w.send(svc, 'ana presses Reply…', (f) => f.payload.click(ANA, ask.channel, ask.ts, 'ask_reply'));
    const ack = (await w.send(svc, 'eve submits that modal', (f) =>
      f.payload.submit(EVE, lastView(), { answer: 'SQLite, trust me' }),
    )) as Ack;
    assert.match(ack!.errors!.answer, REFUSED);
    assert.equal(answered(), false);
    await w.send(svc, 'ana submits it', (f) => f.payload.submit(ANA, lastView(), { answer: 'Postgres' }));
    const answer = readJson(path.join(w.root, '.agents', 'answers', 's1', 'q1.json'));
    assert.deepEqual([answer.text, answer.author], ['Postgres', `slack:${ANA}`]);
  } finally {
    w.cleanup();
  }
});

test('approvals in a shared channel: Approve, Rework… and the rework modal from a non-owner change nothing', async () => {
  const l = liveWorld();
  const { w, calls, replies, lastView } = l;
  try {
    const { a, map, api, mig } = await approvalTrail(w);
    connected(w, { notify: { target: 'C0INFRA01', events: ['awaiting'], detail: 'full' } });
    const svc = w.service(a);
    await until(() => svc.status().state === 'online');
    await svc.tick();
    assert.equal(posted(l.fake, 'Approve')[0], 'C0INFRA01');
    await w.send(svc, 'eve presses Approve', (f) => f.payload.click(EVE, ...posted(f, 'Approve'), 'verify_approve'));
    await w.send(svc, 'eve presses Rework…', (f) => f.payload.click(EVE, ...posted(f, 'Held'), 'verify_rework'));
    assert.ok(replies().length === 2 && replies().every((r) => REFUSED.test(r.text)));
    assert.equal(calls('views.open').length, 0);

    await w.send(svc, 'ana presses Rework…', (f) => f.payload.click(ANA, ...posted(f, 'Held'), 'verify_rework'));
    const ack = (await w.send(svc, 'eve submits the rework modal', (f) =>
      f.payload.submit(EVE, lastView(), { reason: 'Delete the tests' }),
    )) as Ack;
    assert.match(ack!.errors!.reason, REFUSED);
    const snap = await a.loadMap(map.id);
    assert.deepEqual(
      [api, mig].map((t) => snap.tickets.find((x) => x.id === t.id)!.state),
      ['open', 'open'],
    );
    const by = [...readVerdicts(w.root, map.id, api.id), ...readVerdicts(w.root, map.id, mig.id)].map((v) => v.by);
    assert.deepEqual(by, ['claude-02'], 'no verdict from Slack');

    await w.send(svc, 'ana presses Approve', (f) => f.payload.click(ANA, ...posted(f, 'Approve'), 'verify_approve'));
    assert.deepEqual(
      readVerdicts(w.root, map.id, api.id).map((v) => [v.by, v.byKind]),
      [
        ['claude-02', 'agent'],
        [`slack:${ANA}`, 'trail lead'],
      ],
      'the approval is recorded under the confirmed owner, by the id on the payload',
    );
  } finally {
    w.cleanup();
  }
});

test('the decision modal: a non-owner can neither switch its trail nor submit it', async () => {
  const { w, svc, a, map, second, fake, calls, lastView } = await shared();
  try {
    const ts = fake.human.post('C0INFRA01', ANA, 'Use Postgres.');
    await w.send(svc, 'ana runs Save as decision', (f) => f.payload.shortcut(ANA, 'C0INFRA01', ts));
    const updates = calls('views.update').length;
    await w.send(svc, 'eve switches the trail in that modal', (f) =>
      f.payload.pick(EVE, lastView(), 'trail_pick', second.map.id),
    );
    assert.equal(calls('views.update').length, updates, 'the trail and its tickets are not listed for them');
    const ack = (await w.send(svc, 'eve submits it', (f) => f.payload.submit(EVE, lastView()))) as Ack;
    assert.match(ack!.errors!.decision, REFUSED);
    assert.deepEqual(await a.listDecisions(map.id), []);
    await w.send(svc, 'ana submits it', (f) => f.payload.submit(ANA, lastView()));
    assert.deepEqual(
      (await a.listDecisions(map.id)).map((d) => d.decidedBy),
      [`slack:${ANA}`],
    );
  } finally {
    w.cleanup();
  }
});

test('messages written in a channel or a DM do nothing, whoever writes them', async () => {
  const { w, svc, fake, ask, answered, methods } = await shared();
  try {
    const before = methods().length;
    for (const [user, channel, text] of [
      [EVE, ask.channel, 'Postgres'],
      [EVE, fake.im(EVE), 'approve'],
      [ANA, ask.channel, 'Postgres'],
    ]) {
      const event = { type: 'message', user, channel, text, ts: '1793448100.000001', thread_ts: ask.ts };
      const r = await svc.onEnvelope({
        envelope_id: 'm',
        type: 'events_api',
        payload: { team_id: fake.team.id, api_app_id: fake.app.id, type: 'event_callback', event },
      });
      assert.equal(r, undefined);
    }
    await svc.idle();
    assert.equal(methods().length, before, 'no API call follows a message');
    assert.equal(answered(), false, 'answers come from buttons and the modal only');
  } finally {
    w.cleanup();
  }
});

test('a member the trail lead allowed may answer; one who was removed from the list may not', async () => {
  const { w, svc, ask, answered, replies } = await shared();
  try {
    svc.updateSettings({ allow: [{ id: RAJ, name: 'raj' }] });
    svc.updateSettings({ allow: [] });
    await w.send(svc, 'raj presses Postgres after being removed', (f) =>
      f.payload.click(RAJ, ask.channel, ask.ts, 'ask_option:0'),
    );
    assert.match(replies().at(-1)!.text, REFUSED);
    svc.updateSettings({ allow: [{ id: RAJ, name: 'raj' }] });
    await w.send(svc, 'raj presses Postgres while allowed', (f) =>
      f.payload.click(RAJ, ask.channel, ask.ts, 'ask_option:0'),
    );
    assert.equal(answered(), true);
    const given = readJson(path.join(w.root, '.agents', 'answers', 's1', 'q1.json'));
    assert.equal(given.author, `slack:${RAJ}`);
    assert.equal(given.via, 'slack', 'labelled as given in Slack');
  } finally {
    w.cleanup();
  }
});
