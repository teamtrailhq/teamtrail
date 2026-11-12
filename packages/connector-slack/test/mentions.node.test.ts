/** @Scout in a channel and DMs to Scout: answered in place, read-only, owner-checked, escaped. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { recordDecision } from '@teamtrail/core';
import { ANA, EVE, agentDoc, connected, freezeTime, liveWorld, until } from './harness';
import { eventStore } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

async function setup() {
  const l = liveWorld();
  const trail = await eventStore();
  const { a } = trail;
  connected(l.w, { notify: { target: 'dm', events: ['awaiting'], detail: 'full' } });
  const svc = l.w.service(a);
  await until(() => svc.status().state === 'online');
  const event = async (ev: Record<string, unknown>) => {
    const r = await svc.onEnvelope({
      envelope_id: 'e1',
      type: 'events_api',
      payload: { type: 'event_callback', team_id: 'T0EFIKA01', event: ev },
    });
    await r?.after?.();
  };
  const posts = () => l.calls('chat.postMessage');
  return { ...trail, ...l, svc, event, posts };
}

const mention = (o: { user: string; text: string; thread?: string }) => ({
  type: 'app_mention',
  user: o.user,
  channel: 'C0INFRA01',
  ts: '100.1',
  ...(o.thread ? { thread_ts: o.thread } : {}),
  text: o.text,
});
const dm = (o: { user: string; text: string; extra?: Record<string, unknown> }) => ({
  type: 'message',
  channel_type: 'im',
  user: o.user,
  channel: 'D00ANA0001',
  ts: '200.1',
  text: o.text,
  ...o.extra,
});

test('@Scout inbox and status in a channel are seen only by the person who asked, never posted to the channel', async () => {
  const { w, map, event, posts, calls } = await setup();
  try {
    agentDoc(w.root, { sid: 's1', mapId: map.id, pending: [{ id: 'q1', text: 'Which client?', at: Date.now() }] });
    const before = posts().length;
    // Whatever the bot's id looks like (the fake's has lowercase letters), the mention itself isn't the command.
    await event(mention({ user: ANA, text: '<@U0ScoutBOT> inbox' }));
    await event(mention({ user: ANA, text: '<@U0ScoutBOT|scout> status' }));
    assert.equal(posts().length, before, 'nothing about the trails is posted where the channel can read it');
    const [inbox, status] = calls('chat.postEphemeral').slice(-2);
    assert.equal(inbox.channel, 'C0INFRA01');
    assert.equal(inbox.user, ANA, 'only Ana sees it');
    assert.equal(inbox.thread_ts, undefined, 'in the channel: a mention with no replies has no thread to open');
    assert.match(inbox.text, /1 waiting on you/);
    assert.equal(status.user, ANA);
    for (const p of [inbox, status])
      assert.ok(!(p.blocks ?? []).some((b: { type: string }) => b.type === 'actions'), 'no buttons');
    await event(mention({ user: ANA, text: '<@U0ScoutBOT> inbox', thread: '90.0' }));
    assert.equal(calls('chat.postEphemeral').at(-1)!.thread_ts, '90.0', 'a mention inside a thread is answered there');
    await event(mention({ user: ANA, text: '<@B0SCOUT> help', thread: '90.0' }));
    const help = posts().at(-1)!;
    assert.equal(help.thread_ts, '90.0', 'help is public, in the thread the mention was in');
    assert.match(help.text, /@Scout inbox/);
  } finally {
    w.cleanup();
  }
});

test('a DM to Scout is answered in the DM, and anything else gets the help', async () => {
  const { w, fake, event, posts } = await setup();
  try {
    assert.equal(fake.im(ANA), 'D00ANA0001', 'Ana’s DM with Scout');
    await event(dm({ user: ANA, text: 'hello' }));
    const p = posts().at(-1)!;
    assert.equal(p.channel, 'D00ANA0001');
    assert.equal(p.thread_ts, undefined);
    assert.match(p.text, /@Scout inbox/);
    await event(dm({ user: ANA, text: 'status' }));
    assert.equal(posts().at(-1)!.channel, 'D00ANA0001');
  } finally {
    w.cleanup();
  }
});

test('mentions and DMs written as sentences are understood: inbox, status of a trail, help, and anything else', async () => {
  const { w, fake, map, event, posts, calls } = await setup();
  try {
    fake.im(ANA);
    agentDoc(w.root, { sid: 's1', mapId: map.id, pending: [{ id: 'q1', text: 'Which client?', at: Date.now() }] });
    await event(mention({ user: ANA, text: '<@U0ScoutBOT> whats in the inbox?' }));
    assert.match(calls('chat.postEphemeral').at(-1)!.text, /1 waiting on you/);
    await event(mention({ user: ANA, text: '<@U0ScoutBOT> inbox please' }));
    assert.match(calls('chat.postEphemeral').at(-1)!.text, /1 waiting on you/);
    await event(mention({ user: ANA, text: "<@U0ScoutBOT> what's the status of Event store?" }));
    assert.match(JSON.stringify(calls('chat.postEphemeral').at(-1)), /Event store/);
    await event(mention({ user: ANA, text: '<@U0ScoutBOT> status of nothing like it' }));
    const missed = JSON.stringify(calls('chat.postEphemeral').at(-1));
    assert.match(missed, /No trail matches/);
    assert.match(missed, /Event store/, 'all trails instead of nothing');
    await event(dm({ user: ANA, text: 'hi' }));
    assert.match(posts().at(-1)!.text, /Try \*@Scout inbox\*/);
    await event(dm({ user: ANA, text: 'HELP!' }));
    assert.doesNotMatch(posts().at(-1)!.text, /Try/);
    assert.match(posts().at(-1)!.text, /@Scout status/);
    await event(dm({ user: ANA, text: 'whats in the inbox?' }));
    assert.match(posts().at(-1)!.text, /1 waiting on you/, 'the same parsing in a DM');
  } finally {
    w.cleanup();
  }
});

test('someone who is not the owner or allowed is refused politely, and nothing is read', async () => {
  const { w, event, posts } = await setup();
  try {
    await event(mention({ user: EVE, text: '<@B0SCOUT> inbox' }));
    assert.match(posts().at(-1)!.text, /Only the Teamtrail owner and allowed users/);
  } finally {
    w.cleanup();
  }
});

test("bots, edits and Scout's own messages get no answer, and typed text comes back escaped", async () => {
  const { w, event, posts } = await setup();
  try {
    const before = posts().length;
    await event(dm({ user: ANA, text: 'hi', extra: { bot_id: 'B0SCOUT' } }));
    await event(dm({ user: ANA, text: 'hi', extra: { subtype: 'message_changed' } }));
    await event({ type: 'message', channel_type: 'channel', user: ANA, channel: 'C1', ts: '1.1', text: 'hi' });
    assert.equal(posts().length, before);
    await event(mention({ user: ANA, text: '<@B0SCOUT> <!channel>' }));
    const text = posts().at(-1)!.text as string;
    assert.match(text, /Try \*@Scout inbox\*/);
    assert.doesNotMatch(text, /<!channel>/);
  } finally {
    w.cleanup();
  }
});

test('Settings knows whether @Scout mentions can reach this Teamtrail: the workspace must have granted the scope', async () => {
  const l = liveWorld();
  try {
    const { a } = await eventStore();
    connected(l.w);
    l.w.hub.state.scopes = ['commands', 'chat:write'];
    const old = l.w.service(a);
    await until(() => old.status().state === 'online');
    assert.equal(old.status().mentions, false, 'installed before app_mentions:read: reconnect to allow mentions');
    old.close();
    l.w.hub.state.scopes = ['commands', 'chat:write', 'app_mentions:read'];
    const fresh = l.w.service(a);
    await until(() => fresh.status().state === 'online');
    assert.equal(fresh.status().mentions, true);
  } finally {
    l.w.cleanup();
  }
});

test('a ticket, the decisions and who is working are answered to the asker alone, read-only and escaped', async () => {
  const { w, map, a, db, migrate, event, posts, calls } = await setup();
  try {
    agentDoc(w.root, {
      sid: 's1',
      mapId: map.id,
      ticketId: db.id,
      agent: 'claude-07',
      pending: [{ id: 'q1', ticketId: db.id, text: 'Postgres?', at: Date.now() }],
    });
    await recordDecision(a, map.id, {
      ticketId: db.id,
      ticketKey: db.key,
      question: 'Pick DB',
      answer: 'Postgres, for <!channel> durability. Long rationale that stays out of Slack.',
      summary: 'Postgres, for <!channel> durability.',
      decidedBy: 'claude-07',
      source: { kind: 'agent', ref: 's1' },
    });
    const before = posts().length;
    const ephemeral = () => JSON.stringify(calls('chat.postEphemeral').at(-1));

    await event(mention({ user: ANA, text: `<@U0ScoutBOT> what's blocking ${migrate.key}?` }));
    const ticket = ephemeral();
    assert.match(ticket, /Migrate schema/);
    assert.match(ticket, new RegExp(`Blocked by: ${db.key} Pick DB`));
    assert.equal(calls('chat.postEphemeral').at(-1)!.user, ANA);

    await event(mention({ user: ANA, text: `<@U0ScoutBOT> ${db.key}` }));
    const card = ephemeral();
    assert.match(card, /On it: claude-07/);
    assert.match(card, /Waiting on you: 1 question/);
    assert.match(card, /Blocks: .*Migrate schema/);
    assert.match(card, /agent claude-07/, 'an agent’s own call is never shown as the human’s');

    await event(mention({ user: ANA, text: "<@U0ScoutBOT> what's blocked?" }));
    assert.match(ephemeral(), /Migrate schema · Event store · blocked by/);

    await event(mention({ user: ANA, text: '<@U0ScoutBOT> what did we decide about postgres?' }));
    const decisions = ephemeral();
    assert.match(decisions, /D-1/);
    assert.doesNotMatch(decisions, /<!channel>/, 'escaped');
    assert.doesNotMatch(decisions, /Long rationale/, 'the summary only');
    await event(mention({ user: ANA, text: '<@U0ScoutBOT> decisions about kafka' }));
    assert.match(ephemeral(), /No decision mentions/);
    await event(mention({ user: ANA, text: '<@U0ScoutBOT> decisions on Mobile sync' }));
    assert.match(ephemeral(), /No decisions on Mobile sync yet/);

    await event(mention({ user: ANA, text: "<@U0ScoutBOT> who's working?" }));
    assert.match(ephemeral(), /claude-07.*Pick DB.*waiting on you/);

    await event(mention({ user: ANA, text: '<@U0ScoutBOT> ticket nothing like it' }));
    assert.match(ephemeral(), /No ticket matches/);
    assert.equal(posts().length, before, 'nothing about the trails is posted where the channel can read it');
  } finally {
    w.cleanup();
  }
});

test('/scout ticket, decisions and who answer the same, to the person who typed them', async () => {
  const { w, svc, migrate, replies } = await setup();
  try {
    const slash = async (text: string) => {
      const ack = await w.send(svc, `/scout ${text}`, (f) => f.payload.command(ANA, 'C0INFRA01', text));
      if (ack !== undefined && JSON.stringify(ack).includes('ephemeral')) return JSON.stringify(ack);
      const last = replies().at(-1)!;
      assert.equal(last.response_type, 'ephemeral', 'only the person who typed it sees it');
      return JSON.stringify(last);
    };
    assert.match(await slash(`ticket ${migrate.key}`), /Migrate schema.*Blocked by/);
    assert.match(await slash('decisions'), /No decisions yet/);
    assert.match(await slash('who'), /No agents are working/);
    const help = await slash('help');
    assert.match(help, /\/scout ticket #12/);
    assert.match(help, /\/scout decisions/);
  } finally {
    w.cleanup();
  }
});
