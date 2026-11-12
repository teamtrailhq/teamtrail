/** What a linked Teamtrail may ask of Slack through the service: its own workspace, its own owner, few methods. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { secrets } from '../src/crypto/secrets';
import { connect, linked, world, type World } from './harness';

let w: World;
beforeEach(async () => (w = await world()));
afterEach(() => w.close());

describe('calls', () => {
  test('a call goes out with the link workspace bot token, and a token in the arguments is dropped', async () => {
    await linked(w, { team: 'T2', user: 'U9' });
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    const r = await c.call('users.info', { user: 'U5', token: 'xoxb-T2-secret' });
    expect(r).toMatchObject({ ok: true });
    const sent = w.slack.calls.at(-1)!;
    expect(sent.token).toBe('xoxb-T1-secret');
    expect(sent.args.token).toBeUndefined();
  });

  test('methods outside the list are refused and never reach Slack', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    for (const method of [
      'apps.connections.open',
      'admin.users.list',
      'chat.delete',
      'users.lookupByEmail',
      'files.upload',
    ])
      expect(await c.call(method)).toMatchObject({ ok: false, error: 'method_not_allowed' });
    expect(w.slack.calls).toHaveLength(0);
  });

  test("DMs and the Home tab are the link owner's only", async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    expect(await c.call('views.publish', { user_id: 'U2', view: {} })).toMatchObject({ error: 'not_the_link_owner' });
    expect(await c.call('conversations.open', { users: 'U2' })).toMatchObject({ error: 'not_the_link_owner' });
    expect(await c.call('chat.postMessage', { channel: 'U2', text: 'hi' })).toMatchObject({
      error: 'not_the_link_owner',
    });
    expect(await c.call('views.publish', { user_id: 'U1', view: {} })).toMatchObject({ ok: true });
    expect(await c.call('chat.postMessage', { channel: 'C1', text: 'hi' })).toMatchObject({ ok: true });
  });

  test('posts and edits carry the link that made them, whatever metadata was sent', async () => {
    const { token, id } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    await c.call('chat.postMessage', {
      channel: 'C1',
      text: 'hi',
      metadata: { event_type: 'scout_link', event_payload: { link: 'Lsomeoneelse' } },
    });
    expect(w.slack.calls.at(-1)!.args.metadata).toEqual({ event_type: 'scout_link', event_payload: { link: id } });
  });

  test("Slack's errors come back by code; no text or token is logged", async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    w.slack.failing.set('chat.postMessage', 'channel_not_found');
    expect(await c.call('chat.postMessage', { channel: 'C1', text: 'secret words' })).toEqual({
      type: 'result',
      id: expect.any(String),
      ok: false,
      error: 'channel_not_found',
    });
    const logged = JSON.stringify(w.logs);
    expect(logged).not.toContain('secret words');
    expect(logged).not.toContain('xoxb-');
    expect(logged).not.toContain(token);
  });

  test('calls past the per-link limit are refused', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    const results = await Promise.all(Array.from({ length: 40 }, () => c.call('auth.test')));
    expect(results.filter((r) => r.error === 'ratelimited').length).toBeGreaterThan(0);
  });

  test('a removed link can make no more calls', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    await w.store.removeLink((await w.store.linkByTokenHash(secrets.hash(token)))!.id);
    expect(await c.call('auth.test')).toMatchObject({ ok: false, error: 'unknown_link' });
    expect(await c.next((m) => m.type === 'closed')).toEqual({ type: 'closed', reason: 'disconnected' });
  });

  test('a message that is not valid JSON or too large closes the socket', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    c.ws.send('not json');
    expect(await c.closed).toBe(4400);
    const d = await connect(w.base, token);
    d.ws.send('x'.repeat(600 * 1024));
    // 1009 (message too big), or 1006 when the server cuts the socket while the client is still sending.
    expect([1006, 1009]).toContain(await d.closed);
  });

  test('a third socket for one link replaces the oldest', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const a = await connect(w.base, token);
    await connect(w.base, token);
    await connect(w.base, token);
    expect(await a.next((m) => m.type === 'closed')).toEqual({ type: 'closed', reason: 'replaced' });
  });
});
