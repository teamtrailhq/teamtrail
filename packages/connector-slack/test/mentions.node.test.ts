/** @Scout in a channel and DMs to Scout: answered in place, read-only, owner-checked, escaped. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ANA, EVE, agentDoc, connected, freezeTime, liveWorld, until } from './harness';
import { eventStore } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

async function setup() {
  const l = liveWorld();
  const { a, map } = await eventStore();
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
  return { ...l, svc, map, event, posts };
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
    assert.equal(inbox.thread_ts, '100.1', 'in the mention’s thread');
    assert.match(inbox.text, /1 waiting on you/);
    assert.equal(status.user, ANA);
    for (const p of [inbox, status])
      assert.ok(!(p.blocks ?? []).some((b: { type: string }) => b.type === 'actions'), 'no buttons');
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
