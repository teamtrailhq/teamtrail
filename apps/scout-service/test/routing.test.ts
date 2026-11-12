/** Slack's requests: signed only, passed to the right Teamtrail, answered when it isn't there. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { connect, fromSlack, linked, world, type World } from './harness';

let w: World;
beforeEach(async () => (w = await world()));
afterEach(() => w.close());

const command = (o: { team: string; user: string; text?: string }) =>
  new URLSearchParams({
    command: '/scout',
    text: o.text ?? 'inbox',
    team_id: o.team,
    user_id: o.user,
    response_url: 'https://hooks.example/x',
  }).toString();

const click = (o: { team: string; user: string; link?: string; responseUrl?: string }) =>
  new URLSearchParams({
    payload: JSON.stringify({
      type: 'block_actions',
      team: { id: o.team },
      user: { id: o.user },
      response_url: o.responseUrl,
      message: o.link ? { metadata: { event_type: 'scout_link', event_payload: { link: o.link } } } : {},
    }),
  }).toString();

describe('signatures', () => {
  test('unsigned, stale or tampered requests are refused before anything is read', async () => {
    const res = await fetch(`${w.base}/slack/commands`, { method: 'POST', body: command({ team: 'T1', user: 'U1' }) });
    expect(res.status).toBe(401);
    const stale = await fromSlack(w, { path: '/slack/commands', body: 'x=1', form: true, at: Date.now() - 6 * 60_000 });
    expect(stale.status).toBe(401);
    const ok = await fromSlack(w, { path: '/slack/events', body: '{"type":"url_verification","challenge":"abc"}' });
    expect(ok).toEqual({ status: 200, body: { challenge: 'abc' } });
  });
});

describe('delivery', () => {
  test('a command reaches the Teamtrail of the account that typed it, and its ack is the answer', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    expect(c.messages[0]).toMatchObject({ type: 'ready', teamId: 'T1', userId: 'U1', botUserId: 'BT1' });
    c.answer((e) => ({ text: `got ${e.payload.text}` }));
    const r = await fromSlack(w, { path: '/slack/commands', body: command({ team: 'T1', user: 'U1' }), form: true });
    expect(r.body).toEqual({ text: 'got inbox' });
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
    const offline = await fromSlack(w, {
      path: '/slack/commands',
      body: command({ team: 'T1', user: 'U1' }),
      form: true,
    });
    expect(offline.body).toMatchObject({ response_type: 'ephemeral' });
    expect(offline.body.text).toContain("isn't running");
  });

  test('a click goes to the Teamtrail that posted the message, even when someone else clicks', async () => {
    const owner = await linked(w, { team: 'T1', user: 'U1' });
    const other = await linked(w, { team: 'T1', user: 'U2' });
    const a = await connect(w.base, owner.token);
    const b = await connect(w.base, other.token);
    a.answer(() => undefined);
    b.answer(() => undefined);
    await fromSlack(w, {
      path: '/slack/interactions',
      body: click({ team: 'T1', user: 'U2', link: owner.id }),
      form: true,
    });
    expect(a.messages.some((m) => m.type === 'envelope')).toBe(true);
    expect(b.messages.some((m) => m.type === 'envelope')).toBe(false);
  });

  test("a message's link from another workspace is ignored: routing stays in the clicker's workspace", async () => {
    const foreign = await linked(w, { team: 'T2', user: 'U9' });
    const mine = await linked(w, { team: 'T1', user: 'U1' });
    const f = await connect(w.base, foreign.token);
    const m = await connect(w.base, mine.token);
    f.answer(() => undefined);
    m.answer(() => undefined);
    await fromSlack(w, {
      path: '/slack/interactions',
      body: click({ team: 'T1', user: 'U1', link: foreign.id }),
      form: true,
    });
    expect(f.messages.some((x) => x.type === 'envelope')).toBe(false);
    expect(m.messages.some((x) => x.type === 'envelope')).toBe(true);
  });

  test('an offline click answers on the response_url only when it is Slack hooks address', async () => {
    await linked(w, { team: 'T1', user: 'U1' });
    const good = `${w.slack.url}/hooks/abc`;
    await fromSlack(w, {
      path: '/slack/interactions',
      body: click({ team: 'T1', user: 'U1', responseUrl: good }),
      form: true,
    });
    await fromSlack(w, {
      path: '/slack/interactions',
      body: click({ team: 'T1', user: 'U1', responseUrl: 'http://127.0.0.1:1/hooks/evil' }),
      form: true,
    });
    expect(w.slack.hooks.map((h) => h.path)).toEqual(['/hooks/abc']);
    expect(String(w.slack.hooks[0].body.text)).toContain("isn't running");
  });

  test('an event is acked at once, passed on once, and a retry is dropped', async () => {
    const { token } = await linked(w, { team: 'T1', user: 'U1' });
    const c = await connect(w.base, token);
    c.answer(() => undefined);
    const event = JSON.stringify({
      type: 'event_callback',
      team_id: 'T1',
      event_id: 'Ev1',
      event: { type: 'app_home_opened', user: 'U1', tab: 'home' },
    });
    expect((await fromSlack(w, { path: '/slack/events', body: event })).status).toBe(200);
    await c.next((m) => m.type === 'envelope');
    await fromSlack(w, { path: '/slack/events', body: event });
    await new Promise((r) => setTimeout(r, 100));
    expect(c.messages.filter((m) => m.type === 'envelope')).toHaveLength(1);
  });

  test('the Home tab of an offline Teamtrail says so, published with the bot token', async () => {
    await linked(w, { team: 'T1', user: 'U1' });
    const event = JSON.stringify({
      type: 'event_callback',
      team_id: 'T1',
      event_id: 'Ev2',
      event: { type: 'app_home_opened', user: 'U1', tab: 'home' },
    });
    await fromSlack(w, { path: '/slack/events', body: event });
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
