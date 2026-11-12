/**
 * The review of PR 73, attack by attack. Every link in a workspace shares one bot, so a Scout message or modal
 * proves nothing about which Teamtrail it belongs to: clicks go only where the service's own record says.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { connect, fromSlack, linked, world, type Client, type World } from './harness';
import { clickInView, clickOnMessage, messageAction, submission } from './payloads';

let w: World;
let a: Client;
let b: Client;
let aLink: { token: string; id: string };
let bLink: { token: string; id: string };

const envelopes = (c: Client) => c.messages.filter((m) => m.type === 'envelope');
const interaction = (body: string) => fromSlack(w, { path: '/slack/interactions', body, form: true });

/** Alice (U1) and Bob (U2) in one workspace, each with their own Teamtrail online, both members of C1. */
beforeEach(async () => {
  w = await world();
  w.slack.members.set('C1', ['U1', 'U2']);
  aLink = await linked(w, { team: 'T1', user: 'U1' });
  bLink = await linked(w, { team: 'T1', user: 'U2' });
  a = await connect(w.base, aLink.token);
  b = await connect(w.base, bLink.token);
  a.answer(() => undefined);
  b.answer(() => undefined);
});
afterEach(() => w.close());

async function alicePosts() {
  const r = await a.call('chat.postMessage', { channel: 'C1', text: 'Approve?' });
  return r.response as { channel: string; ts: string };
}

describe('1. forged buttons never reach a teammate (no fallback to the clicker)', () => {
  test("a click on Alice's posted message goes to Alice's Teamtrail, even when Bob clicks", async () => {
    const m = await alicePosts();
    await interaction(clickOnMessage({ team: 'T1', user: 'U2', ...m, stamp: aLink.id }));
    expect(envelopes(a)).toHaveLength(1);
    expect(envelopes(b)).toHaveLength(0);
  });

  test('a message Alice made without the service (a response_url or an old in_channel ack) reaches nobody', async () => {
    const hook = `${w.slack.url}/hooks/bob`;
    await interaction(
      clickOnMessage({ team: 'T1', user: 'U2', channel: 'C1', ts: '1699999999.000001', responseUrl: hook }),
    );
    expect(envelopes(b)).toHaveLength(0);
    expect(envelopes(a)).toHaveLength(0);
    expect(String(w.slack.hooks.at(-1)?.body.text)).toContain('no longer connected');
  });

  test('a stamp naming Bob on a message the record gives to Alice is dropped', async () => {
    const m = await alicePosts();
    await interaction(clickOnMessage({ team: 'T1', user: 'U2', ...m, stamp: bLink.id }));
    expect(envelopes(a)).toHaveLength(0);
    expect(envelopes(b)).toHaveLength(0);
  });

  test('after Alice disconnects, a click on her old message reaches nobody', async () => {
    const m = await alicePosts();
    await fetch(`${w.base}/link`, { method: 'DELETE', headers: { Authorization: `Bearer ${aLink.token}` } });
    await interaction(clickOnMessage({ team: 'T1', user: 'U2', ...m, stamp: aLink.id }));
    expect(envelopes(b)).toHaveLength(0);
  });

  test('after Alice is replaced as a sixth link, a click on her old message reaches none of her links', async () => {
    const m = await alicePosts();
    const newer = [];
    for (let i = 0; i < 5; i++) {
      w.clock.offset += 60_000; // past the per-address limit on /install and /link
      newer.push(await linked(w, { team: 'T1', user: 'U1' }));
    }
    const latest = await connect(w.base, newer.at(-1)!.token);
    latest.answer(() => undefined);
    await interaction(clickOnMessage({ team: 'T1', user: 'U1', ...m }));
    expect(envelopes(latest)).toHaveLength(0);
    expect(envelopes(b)).toHaveLength(0);
  });

  test("in a Slack Connect channel, a click from another workspace never reaches the clicker's Teamtrail", async () => {
    const m = await alicePosts();
    const other = await linked(w, { team: 'T2', user: 'U9' });
    const o = await connect(w.base, other.token);
    o.answer(() => undefined);
    await interaction(clickOnMessage({ team: 'T2', user: 'U9', ...m, stamp: aLink.id }));
    expect(envelopes(o)).toHaveLength(0);
    expect(envelopes(a)).toHaveLength(0);
  });

  test('a click on an ephemeral message is dropped: nothing on record says whose it is', async () => {
    await interaction(clickOnMessage({ team: 'T1', user: 'U2', channel: 'C1', ts: '1.1', ephemeral: true }));
    expect(envelopes(b)).toHaveLength(0);
  });
});

describe('1. modals and the Home tab', () => {
  test("a click or submission in Alice's modal is dropped when Bob's Teamtrail is the target", async () => {
    const opened = await a.call('views.open', { trigger_id: 't', view: { type: 'modal' } });
    const viewId = opened.response.view.id as string;
    await interaction(clickInView({ team: 'T1', user: 'U2', viewId }));
    const r = await interaction(submission({ team: 'T1', user: 'U2', viewId }));
    expect(envelopes(a)).toHaveLength(0);
    expect(envelopes(b)).toHaveLength(0);
    expect(JSON.stringify(r.body)).toContain('no longer connected');
  });

  test("Alice's clicks in her own modal and Home tab reach her", async () => {
    const opened = await a.call('views.open', { trigger_id: 't', view: { type: 'modal' } });
    await interaction(clickInView({ team: 'T1', user: 'U1', viewId: opened.response.view.id }));
    const home = await a.call('views.publish', { user_id: 'U1', view: { type: 'home' } });
    await interaction(clickInView({ team: 'T1', user: 'U1', viewId: home.response.view.id }));
    expect(envelopes(a)).toHaveLength(2);
  });

  test('a modal submission ack keeps only a response action', async () => {
    const opened = await a.call('views.open', { trigger_id: 't', view: { type: 'modal' } });
    a.answer(() => ({ response_action: 'errors', errors: { b: 'Required' }, response_type: 'in_channel', text: 'x' }));
    const r = await interaction(submission({ team: 'T1', user: 'U1', viewId: opened.response.view.id }));
    expect(r.body).toEqual({ response_action: 'errors', errors: { b: 'Required' } });
    a.answer(() => ({ response_action: 'post', text: 'x' }));
    const bad = await interaction(submission({ team: 'T1', user: 'U1', viewId: opened.response.view.id }));
    expect(bad.body).toBeUndefined();
  });

  test('a block_actions ack is never passed back to Slack', async () => {
    const m = await alicePosts();
    a.answer(() => ({ response_type: 'in_channel', text: 'Approve?', replace_original: true }));
    const r = await interaction(clickOnMessage({ team: 'T1', user: 'U1', ...m }));
    expect(r.body).toBeUndefined();
  });
});

describe("3. shortcuts never send someone else's message or trigger to the poster", () => {
  test("Bob's Save as decision on Alice's message goes to Bob's Teamtrail only", async () => {
    const m = await alicePosts();
    await interaction(messageAction({ team: 'T1', user: 'U2', ...m, stamp: aLink.id }));
    expect(envelopes(a)).toHaveLength(0);
    expect(envelopes(b)).toHaveLength(1);
  });

  test('a global shortcut goes to the acting user', async () => {
    const body = new URLSearchParams({
      payload: JSON.stringify({ type: 'shortcut', team: { id: 'T1' }, user: { id: 'U2' }, trigger_id: 't' }),
    }).toString();
    await interaction(body);
    expect(envelopes(b)).toHaveLength(1);
    expect(envelopes(a)).toHaveLength(0);
  });
});
