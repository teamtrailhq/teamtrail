/**
 * `chat.postEphemeral`: a link answers @Scout inbox and status in a channel so only its owner sees it. It is shown to
 * the link's own Slack account and nobody else, only where that account may be posted to, and leaves no mark.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { connect, linked, world, type Client, type World } from './harness';

let w: World;
beforeEach(async () => (w = await world()));
afterEach(() => w.close());

async function online(o: { team: string; user: string }) {
  const l = await linked(w, o);
  const c = await connect(w.base, l.token);
  c.answer(() => undefined);
  return c;
}

const ephemerals = () => w.slack.calls.filter((c) => c.method === 'chat.postEphemeral');

describe('chat.postEphemeral', () => {
  let alice: Client;
  beforeEach(async () => {
    w.slack.members.set('C1', ['U1', 'U2']);
    w.slack.members.set('C2', ['U2']);
    alice = await online({ team: 'T1', user: 'U1' });
    await online({ team: 'T1', user: 'U2' });
  });

  test('is shown to the link’s own account, whoever the call names, in a thread of a channel the owner is in', async () => {
    const r = await alice.call('chat.postEphemeral', { channel: 'C1', user: 'U2', thread_ts: '100.1', text: 'inbox' });
    expect(r).toMatchObject({ ok: true });
    expect(ephemerals().at(-1)!.args).toMatchObject({ channel: 'C1', user: 'U1', thread_ts: '100.1' });
  });

  test('never in a channel the owner isn’t in, another person’s DM, or a group DM', async () => {
    for (const channel of ['C2', 'D2', 'G9', 'U2', undefined])
      expect(await alice.call('chat.postEphemeral', { channel, user: 'U1', text: 'x' }), String(channel)).toMatchObject(
        {
          ok: false,
        },
      );
    expect(ephemerals()).toHaveLength(0);
  });

  test('carries no stamp and leaves no mark: nothing can be clicked back to the link through it', async () => {
    await alice.call('chat.postEphemeral', { channel: 'C1', user: 'U1', text: 'x' });
    expect(ephemerals().at(-1)!.args.metadata).toBeUndefined();
    expect(await alice.call('chat.update', { channel: 'C1', ts: '1.000', text: 'y' })).toMatchObject({ ok: false });
  });
});
