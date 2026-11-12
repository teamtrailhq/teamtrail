/** @Scout in a channel and DMs to Scout: passed on by the person who wrote them, never bots, answered in place. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { connect, fromSlack, linked, world, type Client, type World } from './harness';

let w: World;
beforeEach(async () => (w = await world()));
afterEach(() => w.close());

let n = 0;
const message = (event: Record<string, unknown>) =>
  JSON.stringify({ type: 'event_callback', team_id: 'T1', event_id: `Ev${++n}`, event });
const mention = (o: { user: string; channel?: string; ts?: string; text?: string }) =>
  message({
    type: 'app_mention',
    user: o.user,
    channel: o.channel ?? 'C1',
    ts: o.ts ?? '1.1',
    text: o.text ?? '<@BT1> inbox',
  });
const dm = (o: { user: string; channel?: string; extra?: Record<string, unknown> }) =>
  message({
    type: 'message',
    channel_type: 'im',
    user: o.user,
    channel: o.channel ?? 'D1',
    ts: '2.2',
    text: 'help',
    ...o.extra,
  });

const envelopes = (c: Client) => c.messages.filter((m) => m.type === 'envelope');

describe('mentions and DMs', () => {
  test('a mention goes to the Teamtrail of the person who wrote it, and to nobody else', async () => {
    const ana = await connect(w.base, (await linked(w, { team: 'T1', user: 'U1' })).token);
    const raj = await connect(w.base, (await linked(w, { team: 'T1', user: 'U2' })).token);
    await fromSlack(w, { path: '/slack/events', body: mention({ user: 'U1' }) });
    await ana.next((m) => m.type === 'envelope');
    expect(envelopes(raj)).toHaveLength(0);
  });

  test("bots' messages, Scout's own posts, edits and channel messages that aren't DMs are never passed on", async () => {
    const ana = await connect(w.base, (await linked(w, { team: 'T1', user: 'U1' })).token);
    for (const body of [
      dm({ user: 'U1', extra: { bot_id: 'BT1' } }),
      dm({ user: 'U1', extra: { subtype: 'message_changed' } }),
      dm({ user: 'U1', extra: { bot_profile: { id: 'B9' } } }),
      message({ type: 'message', channel_type: 'channel', user: 'U1', channel: 'C1', ts: '3.3' }),
      message({ type: 'reaction_added', user: 'U1' }),
    ])
      await fromSlack(w, { path: '/slack/events', body });
    await fromSlack(w, { path: '/slack/events', body: dm({ user: 'U1' }) });
    await ana.next((m) => m.type === 'envelope');
    expect(envelopes(ana)).toHaveLength(1);
  });

  test('the same event retried by Slack is passed on once', async () => {
    const ana = await connect(w.base, (await linked(w, { team: 'T1', user: 'U1' })).token);
    const body = mention({ user: 'U1' });
    await fromSlack(w, { path: '/slack/events', body });
    await fromSlack(w, { path: '/slack/events', body });
    await ana.next((m) => m.type === 'envelope');
    await new Promise((r) => setTimeout(r, 50));
    expect(envelopes(ana)).toHaveLength(1);
  });

  test('a DM to Scout lets that person’s link answer in that DM, and no other link', async () => {
    const ana = await connect(w.base, (await linked(w, { team: 'T1', user: 'U1' })).token);
    const raj = await connect(w.base, (await linked(w, { team: 'T1', user: 'U2' })).token);
    expect((await raj.call('chat.postMessage', { channel: 'D1', text: 'hi' })).ok).toBe(false);
    await fromSlack(w, { path: '/slack/events', body: dm({ user: 'U1', channel: 'D1' }) });
    await ana.next((m) => m.type === 'envelope');
    expect((await ana.call('chat.postMessage', { channel: 'D1', text: 'Here is your inbox' })).ok).toBe(true);
    expect((await raj.call('chat.postMessage', { channel: 'D1', text: 'phish' })).ok).toBe(false);
  });

  test('nobody linked or offline: Scout answers the mention privately in its thread, the DM in the DM', async () => {
    await fromSlack(w, { path: '/slack/events', body: mention({ user: 'U7', ts: '9.9' }) });
    await fromSlack(w, { path: '/slack/events', body: dm({ user: 'U7', channel: 'D7' }) });
    // Nothing was ever installed for T1 here, so the service has no token and says nothing.
    expect(w.slack.calls.filter((c) => c.method === 'chat.postEphemeral')).toHaveLength(0);
    await linked(w, { team: 'T1', user: 'U1' });
    await fromSlack(w, { path: '/slack/events', body: mention({ user: 'U7', ts: '9.9' }) });
    await fromSlack(w, { path: '/slack/events', body: dm({ user: 'U7', channel: 'D7' }) });
    await expect.poll(() => w.slack.calls.filter((c) => c.method === 'chat.postEphemeral').length).toBe(1);
    const eph = w.slack.calls.find((c) => c.method === 'chat.postEphemeral')!;
    expect(eph.args).toMatchObject({ channel: 'C1', user: 'U7', thread_ts: '9.9' });
    expect(String(eph.args.text)).toContain('Add Scout to Slack');
    await expect.poll(() => w.slack.calls.filter((c) => c.method === 'chat.postMessage').length).toBe(1);
    expect(w.slack.calls.find((c) => c.method === 'chat.postMessage')!.args).toMatchObject({ channel: 'D7' });
  });

  test('ready tells the Teamtrail which scopes its workspace granted', async () => {
    const ana = await connect(w.base, (await linked(w, { team: 'T1', user: 'U1' })).token);
    expect(ana.messages[0]).toMatchObject({ type: 'ready', scopes: ['commands', 'chat:write'] });
  });
});
