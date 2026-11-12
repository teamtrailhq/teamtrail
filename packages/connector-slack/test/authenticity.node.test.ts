/**
 * Where events come from. The Scout service checked Slack's signature and routes by its own record of what each
 * Teamtrail posted; this Teamtrail checks again: a payload that names another workspace or app is dropped before
 * anyone's id in it is believed, and a click counts only on a message this Teamtrail posted, stamped with its link.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { scoutService } from '../src/link/scoutService';
import { ANA, connected, freezeTime, liveWorld, until } from './harness';
import { approvalTrail, posted } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

test('the Scout service is built in; an override must be https, or http to this machine', () => {
  const quiet = console.warn;
  console.warn = () => {};
  try {
    const at = (v?: string) => scoutService(v === undefined ? {} : { TEAMTRAIL_SCOUT_SERVICE: v });
    assert.deepEqual([at().http, at().connect], ['https://scout.teamtrail.app', 'wss://scout.teamtrail.app/connect']);
    assert.equal(at('https://scout.example/').connect, 'wss://scout.example/connect');
    assert.equal(at('http://127.0.0.1:7499').connect, 'ws://127.0.0.1:7499/connect');
    for (const bad of ['http://scout.example', 'ftp://scout.example', 'https://user:pw@scout.example', 'nope'])
      assert.equal(at(bad).http, 'https://scout.teamtrail.app', bad);
    const install = new URL(
      at().install({ challenge: 'c'.repeat(43), returnUrl: 'http://127.0.0.1:7461/?settings=slack' }),
    );
    assert.deepEqual(
      [install.pathname, install.searchParams.get('return')],
      ['/install', 'http://127.0.0.1:7461/?settings=slack'],
    );
  } finally {
    console.warn = quiet;
  }
});

test('a click on a message another Teamtrail posted, or one this Teamtrail keeps no record of, changes nothing', async () => {
  const l = liveWorld();
  const { w, fake, methods } = l;
  try {
    const { a, map, api } = await approvalTrail(w);
    connected(w);
    const svc = w.service(a);
    await until(() => svc.status().state === 'online');
    await svc.tick();
    const before = methods().length;
    const click = () => fake.payload.click(ANA, ...posted(fake, 'Approve'), 'verify_approve');
    const stamped = (link: string) => ({
      ...click().payload,
      message: {
        ...(click().payload.message as object),
        metadata: { event_type: 'scout_link', event_payload: { link } },
      },
    });
    const elsewhere = {
      ...click().payload,
      container: { type: 'message', channel_id: 'C0INFRA01', message_ts: '1.000001' },
      message: { type: 'message', ts: '1.000001', text: 'no stamp passed on' },
    };
    for (const payload of [stamped('L0SOMEONE01'), elsewhere]) {
      assert.equal(await w.hub.envelope({ type: 'interactive', payload }), undefined);
      await svc.idle();
    }
    assert.equal(methods().length, before, 'nothing was called for them');
    assert.equal((await a.loadMap(map.id)).tickets.find((t) => t.id === api.id)!.state, 'open');
    await w.send(svc, 'the click stamped with this link', () => ({
      type: 'interactive',
      payload: stamped('L0TEST00001'),
    }));
    assert.equal((await a.loadMap(map.id)).tickets.find((t) => t.id === api.id)!.state, 'closed');
  } finally {
    w.cleanup();
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
