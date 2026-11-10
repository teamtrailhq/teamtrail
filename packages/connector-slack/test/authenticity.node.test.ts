/**
 * Where events come from. Socket Mode is the only way in; the socket must be Slack's; and a payload that names
 * another workspace or app is dropped before anyone's id in it is believed.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { MemoryAdapter } from '@teamtrail/core';
import { socketUrl } from '../src/socketUrl';
import { ANA, TOKENS, connected, freezeTime, liveWorld, until } from './harness';
import { approvalTrail, posted } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

test('the Socket Mode address must be wss on Slack; a fake on this machine may answer a loopback one', () => {
  assert.equal(socketUrl('wss://wss-primary.slack.com/link/?ticket=1'), 'wss://wss-primary.slack.com/link/?ticket=1');
  for (const bad of [
    'ws://wss-primary.slack.com/link',
    'https://wss-primary.slack.com/link',
    'wss://evil.example/link',
    'wss://slack.com.evil.example/link',
    'wss://evilslack.com/link',
    'wss://wss-primary.slack.com@evil.example/link',
    'ws://localhost:9999/link',
    'wss://127.0.0.1/link',
    'not a url',
    undefined,
  ])
    assert.throws(() => socketUrl(bad), /Socket Mode address/, String(bad));
  assert.equal(socketUrl('ws://localhost:7499/', 'http://localhost:7499/api'), 'ws://localhost:7499/');
  assert.throws(() => socketUrl('ws://evil.example/', 'http://localhost:7499/api'), /not on Slack/);
  assert.throws(
    () => socketUrl('ws://wss.slack.test/', 'https://slack.test/api'),
    /not on Slack/,
    'no TLS off-machine',
  );
});

/** A Slack whose `apps.connections.open` answers an address that isn't Slack's. */
function hijacked(l: ReturnType<typeof liveWorld>, url: string) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const r = await l.w.fetch(input, init);
    if (!String(input).includes('apps.connections.open')) return r;
    return new Response(JSON.stringify({ ...(await r.json()), url }), { status: 200, headers: r.headers });
  }) as typeof fetch;
}

test('an app-level token whose socket address is not on Slack is refused, and no socket is opened', async () => {
  const l = liveWorld();
  try {
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), { fetch: hijacked(l, 'wss://evil.example/link') });
    const r = await svc.pasteToken(TOKENS.app);
    assert.deepEqual([r.ok, r.code], [false, 'bad_socket_url']);
    assert.equal(l.w.hub.connections, 0);
    assert.equal(r.status.setup.appToken, null, 'the token is not saved');
  } finally {
    l.w.cleanup();
  }
});

test('a running connection never follows a socket address that is not on Slack', async () => {
  const l = liveWorld();
  try {
    connected(l.w);
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), {
      fetch: hijacked(l, 'ws://wss-primary.slack.test/link'),
    });
    await until(() => svc.status().state === 'offline', 'offline');
    assert.match(svc.status().error!, /not on Slack/);
    assert.equal(l.w.hub.connections, 0);
  } finally {
    l.w.cleanup();
  }
});

test("a payload from another workspace or another app is dropped, even with the owner's user id on it", async () => {
  const l = liveWorld();
  const { w, fake, methods, replies } = l;
  try {
    const { a, map, api } = await approvalTrail(w);
    connected(w);
    const svc = w.service(a);
    await until(() => svc.status().state === 'online');
    await svc.tick();
    const before = methods().length;
    const click = () => fake.payload.click(ANA, ...posted(fake, 'Approve'), 'verify_approve');
    const forged = [
      { ...click().payload, team: { id: 'T0OTHER01' } },
      { ...click().payload, api_app_id: 'A0OTHER001' },
      { ...click().payload, team: undefined, user: { id: ANA } },
      { ...fake.payload.command(ANA, 'C0INFRA01', 'status').payload, team_id: 'T0OTHER01' },
      { ...fake.payload.homeOpened(ANA).payload, team_id: 'T0OTHER01' },
      { ...fake.payload.homeOpened(ANA).payload, api_app_id: 'A0OTHER001' },
    ];
    for (const payload of forged) {
      const type = 'command' in payload ? 'slash_commands' : 'event' in payload ? 'events_api' : 'interactive';
      const ack = await w.hub.envelope({ type, payload });
      await svc.idle();
      assert.equal(ack, undefined, 'acked empty, so Slack does not retry');
    }
    assert.equal(methods().length, before, 'nothing was called for them');
    assert.deepEqual(replies(), []);
    assert.equal((await a.loadMap(map.id)).tickets.find((t) => t.id === api.id)!.state, 'open');

    await w.send(svc, 'the same click from the connected workspace and app', () => click());
    assert.equal((await a.loadMap(map.id)).tickets.find((t) => t.id === api.id)!.state, 'closed');
  } finally {
    w.cleanup();
  }
});
