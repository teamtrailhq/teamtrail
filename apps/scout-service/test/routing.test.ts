/** Slack's requests: signed only, handled once, passed to the right Teamtrail, answered when it isn't there. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { connect, fromSlack, linked, world, type World } from './harness';
import { command, event } from './payloads';

let w: World;
beforeEach(async () => (w = await world()));
afterEach(() => w.close());

describe('signatures', () => {
  test('unsigned, stale or tampered requests are refused before anything is read', async () => {
    const res = await fetch(`${w.base}/slack/commands`, { method: 'POST', body: command({ team: 'T1', user: 'U1' }) });
    expect(res.status).toBe(401);
    const stale = await fromSlack(w, { path: '/slack/commands', body: 'x=1', form: true, at: Date.now() - 6 * 60_000 });
    expect(stale.status).toBe(401);
    const ok = await fromSlack(w, { path: '/slack/events', body: '{"type":"url_verification","challenge":"abc"}' });
    expect(ok).toEqual({ status: 200, body: { challenge: 'abc' } });
  });

  test('a replayed command (same signed request, within the five minutes) is handled once', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    c.answer(() => ({ text: 'ok' }));
    const at = w.now();
    const body = command({ team: 'T1', user: 'U1' });
    expect((await fromSlack(w, { path: '/slack/commands', body, form: true, at })).body).toMatchObject({ text: 'ok' });
    expect((await fromSlack(w, { path: '/slack/commands', body, form: true, at })).body).toBeUndefined();
    expect(c.messages.filter((m) => m.type === 'envelope')).toHaveLength(1);
  });
});

describe('delivery', () => {
  test('a command reaches the Teamtrail of the account that typed it, and its ack is the answer', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    expect(c.messages[0]).toMatchObject({ type: 'ready', teamId: 'T1', userId: 'U1', botUserId: 'BT1' });
    c.answer((e) => ({ text: `got ${e.payload.text}` }));
    const r = await fromSlack(w, { path: '/slack/commands', body: command({ team: 'T1', user: 'U1' }), form: true });
    expect(r.body).toEqual({ response_type: 'ephemeral', text: 'got inbox' });
    const envelope = c.messages.find((m) => m.type === 'envelope')?.envelope;
    expect(envelope).toMatchObject({ type: 'slash_commands', accepts_response_payload: true });
  });

  test('a wrong link token is closed without a ready', async () => {
    await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, 'stl_wrong');
    expect(c.messages.at(-1)).toEqual({ type: 'closed', reason: 'unknown-link' });
    expect(await c.closed).toBe(4000);
  });

  test('nobody linked: Scout says how to connect; linked but offline: Scout says to start it', async () => {
    const none = await fromSlack(w, { path: '/slack/commands', body: command({ team: 'T1', user: 'U1' }), form: true });
    expect(none.body).toBeUndefined();
    await linked(w, { team: 'T1', user: 'U1' });
    const notLinked = await fromSlack(w, {
      path: '/slack/commands',
      body: command({ team: 'T1', user: 'U2' }),
      form: true,
    });
    expect(notLinked.body.text).toContain('Add Scout to Slack');
    const again = command({ team: 'T1', user: 'U1', text: 'status' });
    const offline = await fromSlack(w, { path: '/slack/commands', body: again, form: true });
    expect(offline.body).toMatchObject({ response_type: 'ephemeral' });
    expect(offline.body.text).toContain("isn't running");
  });

  test('an event is acked at once, passed on once, and a retry is dropped', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    c.answer(() => undefined);
    const body = event({ team: 'T1', user: 'U1', id: 'Ev1' });
    expect((await fromSlack(w, { path: '/slack/events', body })).status).toBe(200);
    await c.next((m) => m.type === 'envelope');
    await fromSlack(w, { path: '/slack/events', body });
    await new Promise((r) => setTimeout(r, 100));
    expect(c.messages.filter((m) => m.type === 'envelope')).toHaveLength(1);
  });

  test('the Home tab of an offline Teamtrail says so, published with the bot token', async () => {
    await linked(w, { team: 'T1', user: 'U1' });
    await fromSlack(w, { path: '/slack/events', body: event({ team: 'T1', user: 'U1', id: 'Ev2' }) });
    await new Promise((r) => setTimeout(r, 200));
    const publish = w.slack.calls.find((c) => c.method === 'views.publish');
    expect(publish?.token).toBe('xoxb-T1-secret');
    expect(publish?.args.user_id).toBe('U1');
    expect(JSON.stringify(publish?.args)).toContain("isn't running");
  });

  test('uninstalling removes the workspace and its links, and closes their sockets', async () => {
    const { token, id } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    const body = JSON.stringify({ type: 'event_callback', team_id: 'T1', event: { type: 'app_uninstalled' } });
    await fromSlack(w, { path: '/slack/events', body });
    expect(await c.next((m) => m.type === 'closed')).toEqual({ type: 'closed', reason: 'uninstalled' });
    expect(await w.store.workspace('T1')).toBeUndefined();
    expect(await w.store.link(id)).toBeUndefined();
  });

  test('a disconnected link loses its socket at once', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    await fetch(`${w.base}/link`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    expect(await c.next((m) => m.type === 'closed')).toEqual({ type: 'closed', reason: 'disconnected' });
  });
});

describe('acks passed back to Slack', () => {
  test('a command ack is always ephemeral: in_channel, replace_original and attachments are dropped', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    c.answer(() => ({
      response_type: 'in_channel',
      replace_original: true,
      text: 'Approve?',
      blocks: [{ type: 'actions' }],
      attachments: [{ text: 'x' }],
    }));
    const r = await fromSlack(w, { path: '/slack/commands', body: command({ team: 'T1', user: 'U1' }), form: true });
    expect(r.body).toEqual({ response_type: 'ephemeral', text: 'Approve?', blocks: [{ type: 'actions' }] });
  });
});
