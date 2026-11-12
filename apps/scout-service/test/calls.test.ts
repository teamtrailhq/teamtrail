/** What a linked Teamtrail may ask of Slack through the service: its own workspace, its own things, few methods. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { connect, fromSlack, linked, world, type Client, type World } from './harness';
import { messageAction } from './payloads';

let w: World;
beforeEach(async () => (w = await world()));
afterEach(() => w.close());

async function online(o: { team: string; user: string }) {
  const l = await linked(w, o);
  const c = await connect(w.base, l.token);
  c.answer(() => undefined);
  return { ...l, c };
}

describe('calls', () => {
  test('a call goes out with the link workspace bot token, and a token in the arguments is dropped', async () => {
    await linked(w, { team: 'T2', user: 'U9' });
    const { c } = await online({ team: 'T1', user: 'U1' });
    const r = await c.call('users.info', { user: 'U5', token: 'xoxb-T2-secret' });
    expect(r).toMatchObject({ ok: true });
    const sent = w.slack.calls.at(-1)!;
    expect(sent.token).toBe('xoxb-T1-secret');
    expect(sent.args.token).toBeUndefined();
  });

  test('methods outside the list are refused and never reach Slack', async () => {
    const { c } = await online({ team: 'T1', user: 'U1' });
    const methods = [
      'apps.connections.open',
      'admin.users.list',
      'chat.delete',
      'users.lookupByEmail',
      'conversations.members',
    ];
    for (const method of methods)
      expect(await c.call(method)).toMatchObject({ ok: false, error: 'method_not_allowed' });
    expect(w.slack.calls).toHaveLength(0);
  });

  test('posts and edits carry the link that made them, whatever metadata was sent', async () => {
    const { c, id } = await online({ team: 'T1', user: 'U1' });
    await c.call('chat.postMessage', {
      channel: 'U1',
      text: 'hi',
      metadata: { event_type: 'scout_link', event_payload: { link: 'Lsomeoneelse' } },
    });
    expect(w.slack.calls.at(-1)!.args.metadata).toEqual({ event_type: 'scout_link', event_payload: { link: id } });
  });

  test("Slack's errors come back by code; no text or token is logged", async () => {
    const { c, token } = await online({ team: 'T1', user: 'U1' });
    w.slack.failing.set('chat.postMessage', 'channel_not_found');
    const r = await c.call('chat.postMessage', { channel: 'U1', text: 'secret words' });
    expect(r).toMatchObject({ ok: false, error: 'channel_not_found' });
    const logged = JSON.stringify(w.logs);
    expect(logged).not.toContain('secret words');
    expect(logged).not.toContain('xoxb-');
    expect(logged).not.toContain(token);
  });

  test('calls past the per-link limit are refused', async () => {
    const { c } = await online({ team: 'T1', user: 'U1' });
    const results = await Promise.all(Array.from({ length: 40 }, () => c.call('auth.test')));
    expect(results.filter((r) => r.error === 'ratelimited').length).toBeGreaterThan(0);
  });

  test('a removed link can make no more calls', async () => {
    const { c, id } = await online({ team: 'T1', user: 'U1' });
    await w.store.removeLink(id);
    expect(await c.call('auth.test')).toMatchObject({ ok: false, error: 'unknown_link' });
    expect(await c.next((m) => m.type === 'closed')).toEqual({ type: 'closed', reason: 'disconnected' });
  });
});

describe('2. a link touches only what is its own', () => {
  let alice: Client;
  let bob: Client;
  beforeEach(async () => {
    w.slack.members.set('C1', ['U1', 'U2']);
    w.slack.members.set('G1', ['U2']);
    alice = (await online({ team: 'T1', user: 'U1' })).c;
    bob = (await online({ team: 'T1', user: 'U2' })).c;
  });

  test("Home tab and DM: the owner's only", async () => {
    expect(await alice.call('views.publish', { user_id: 'U2', view: {} })).toMatchObject({
      error: 'not_the_link_owner',
    });
    expect(await alice.call('conversations.open', { users: 'U2' })).toMatchObject({ error: 'not_the_link_owner' });
    expect(await alice.call('chat.postMessage', { channel: 'U2', text: 'hi' })).toMatchObject({
      error: 'not_the_link_owner',
    });
    expect(await alice.call('views.publish', { user_id: 'U1', view: {} })).toMatchObject({ ok: true });
  });

  test("chat.update only on the link's own posts", async () => {
    const posted = (await bob.call('chat.postMessage', { channel: 'C1', text: 'Approve?' })).response;
    const edit = { channel: posted.channel, ts: posted.ts, text: 'Approved by Alice' };
    expect(await alice.call('chat.update', edit)).toMatchObject({ ok: false, error: 'not_the_link_owner' });
    expect(await bob.call('chat.update', edit)).toMatchObject({ ok: true });
    expect(await bob.call('chat.update', { channel: 'C1', ts: '1.2', text: 'x' })).toMatchObject({ ok: false });
  });

  test("posts go to the owner's own DM, or a channel the owner is in; never another DM or group", async () => {
    for (const channel of ['D2', 'G1', 'C9', 'X1', 'D1'])
      expect(await alice.call('chat.postMessage', { channel, text: 'x' }), channel).toMatchObject({ ok: false });
    const dm = (await alice.call('conversations.open', { users: 'U1' })).response.channel.id;
    expect(await alice.call('chat.postMessage', { channel: dm, text: 'x' })).toMatchObject({ ok: true });
    expect(await alice.call('chat.postMessage', { channel: 'C1', text: 'x' })).toMatchObject({ ok: true });
    expect(await bob.call('chat.postMessage', { channel: 'G1', text: 'x' })).toMatchObject({ ok: true });
    const posted = w.slack.calls.filter((c) => c.method === 'chat.postMessage').map((c) => c.args.channel);
    expect(posted).toEqual([dm, 'C1', 'G1']);
  });

  test("views.update only on the link's own views", async () => {
    const view = (await bob.call('views.open', { trigger_id: 't', view: {} })).response.view.id;
    expect(await alice.call('views.update', { view_id: view, view: {} })).toMatchObject({
      error: 'not_the_link_owner',
    });
    expect(await alice.call('views.update', { external_id: 'x', view: {} })).toMatchObject({ ok: false });
    expect(await bob.call('views.update', { view_id: view, view: {} })).toMatchObject({ ok: true });
  });

  test('a thread is readable only by the link a Save as decision gave it to, for ten minutes', async () => {
    const thread = { channel: 'C1', ts: '1699.000100' };
    const permalink = { channel: 'C1', message_ts: thread.ts };
    expect(await alice.call('conversations.replies', thread)).toMatchObject({ ok: false });
    expect(await alice.call('chat.getPermalink', permalink)).toMatchObject({ ok: false });
    await fromSlack(w, {
      path: '/slack/interactions',
      body: messageAction({ team: 'T1', user: 'U1', ...thread }),
      form: true,
    });
    expect(await alice.call('conversations.replies', thread)).toMatchObject({ ok: true });
    expect(await alice.call('chat.getPermalink', permalink)).toMatchObject({ ok: true });
    expect(await bob.call('conversations.replies', thread)).toMatchObject({ ok: false });
    w.clock.offset = 11 * 60_000;
    expect(await alice.call('conversations.replies', thread)).toMatchObject({ ok: false });
  });
});
