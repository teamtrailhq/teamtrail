/**
 * Connecting Scout: Add Scout to Slack from this machine's Lookout, through Teamtrail's Scout service. The Slack
 * account that goes through Slack's consent screen is the owner; only this process holds the PKCE verifier, so the
 * code the browser brings back is useless to anyone else. Then the link: hello with the token, reconnects, and the
 * service closing it for good.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryAdapter } from '@teamtrail/core';
import { writeJsonAtomic } from '@teamtrail/core/bridge';
import { journalFile, journalPath } from '../../core/src/history/journalFile';
import { SLACK_JOURNAL } from '../../core/src/model/lifecycle';
import { homeView } from '../src/blocks';
import { ANA, EVE, LINK, RAJ, connected, freezeTime, liveWorld, readJson, until } from './harness';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

const CODE = 'c'.repeat(43);
type Call = { url: string; method: string; headers: Record<string, string>; body?: Record<string, unknown> };

/** The Scout service's `/link`, answered here; everything else goes on to the fake Slack. */
function scoutLinks(l: ReturnType<typeof liveWorld>, o: { team?: string; user?: string; down?: boolean } = {}) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://scout.test/')) return l.w.fetch(input, init);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (o.down) throw new TypeError('fetch failed');
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    const b = JSON.parse(String(init?.body)) as { code: string; verifier: string };
    if (b.code !== CODE) return Response.json({ error: 'invalid_code' }, { status: 400 });
    if (url.endsWith('/link/preview'))
      return Response.json({
        team: { id: o.team ?? 'T0EFIKA01', name: 'efika' },
        user: { id: o.user ?? ANA, name: 'ana' },
      });
    return Response.json({
      link: LINK,
      team: { id: o.team ?? 'T0EFIKA01', name: 'efika' },
      user: { id: o.user ?? ANA },
      botUserId: 'U0ScoutBOT',
    });
  };
  return { fetch, calls };
}

const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
const url = () => 'http://127.0.0.1:7461/';

test('Add Scout to Slack: the install address carries a challenge and 127.0.0.1; the code and verifier become the link', async () => {
  const l = liveWorld();
  try {
    const s = scoutLinks(l);
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), {
      fetch: s.fetch,
      url: () => 'http://localhost:7461/',
    });
    assert.deepEqual([svc.status().connected, svc.status().state], [false, 'off']);
    const start = new URL(svc.startConnect().url);
    assert.equal(`${start.origin}${start.pathname}`, 'https://scout.test/install');
    assert.equal(start.searchParams.get('return'), 'http://127.0.0.1:7461/?settings=slack', 'never localhost');
    const challenge = start.searchParams.get('challenge')!;
    assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
    const after = await svc.finishConnect(CODE);
    const sent = s.calls[0];
    assert.equal(sent.url, 'https://scout.test/link');
    assert.equal(challengeOf(String(sent.body!.verifier)), challenge, 'the verifier the challenge was made from');
    assert.equal(sent.headers.origin, undefined, 'the service refuses requests with an Origin');
    assert.deepEqual(
      [after.connected, after.enabled, after.owners.map((o) => [o.id, o.via]), after.workspace?.id],
      [true, true, [[ANA, 'oauth']], 'T0EFIKA01'],
      'the Slack account that went through the consent screen is the owner',
    );
    const creds = path.join(l.w.configDir, 'credentials.json');
    assert.deepEqual(readJson(creds), { slack: { link: LINK } });
    if (process.platform !== 'win32') assert.equal(statSync(creds).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(svc.status()).includes(LINK.token), 'status never echoes the token');
    await until(() => svc.status().state === 'online', 'link online');
    assert.equal(l.w.hub.urls[0], 'wss://scout.test/connect', 'the token goes in the hello, never in the address');
    await svc.idle();
    await until(() => l.calls('chat.postMessage').length === 1, 'greeting');
    assert.deepEqual(
      l.calls('chat.postMessage').map((m) => [m.channel, m.text]),
      [['D00ANA0001', 'Connected. Decisions and questions will reach you here.']],
    );
    await until(() => svc.status().links.home !== undefined, 'app id learned');
    assert.equal(svc.status().links.home, 'slack://app?team=T0EFIKA01&id=A0Scout0001&tab=home');
    const journal = journalFile(l.w.root).readSlack(SLACK_JOURNAL);
    assert.deepEqual(
      journal.map((e) => [e.action, e.user, e.via, e.actorKind]),
      [['connected', ANA, 'oauth', 'trail lead']],
    );
    assert.ok(!JSON.stringify(journal).includes(LINK.token), 'the journal never holds the token');
  } finally {
    l.w.cleanup();
  }
});

test('a code is traded once, only after a start here, only in time; a link from elsewhere is refused', async () => {
  const l = liveWorld();
  try {
    const s = scoutLinks(l);
    let now = 1_790_000_000_000;
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), { fetch: s.fetch, url, now: () => now });
    await assert.rejects(svc.finishConnect(CODE), /Nothing is waiting to connect/);
    svc.startConnect();
    await assert.rejects(svc.finishConnect('not-a-code'), /not one Scout made/);
    await assert.rejects(svc.finishConnect(CODE), /Nothing is waiting/, 'the verifier was used up by the wrong try');
    svc.startConnect();
    now += 11 * 60_000;
    await assert.rejects(svc.finishConnect(CODE), /Nothing is waiting/, 'ten minutes to come back');
    assert.equal(s.calls.length, 0, 'nothing reached the service');
    assert.equal(svc.status().connected, false);
  } finally {
    l.w.cleanup();
  }
});

test('connecting to another workspace starts the people and channels in the preferences over', async () => {
  const l = liveWorld();
  try {
    connected(l.w, { allow: [RAJ], notify: { target: 'C0INFRA01', events: ['awaiting'], detail: 'titles-only' } });
    const s = scoutLinks(l, { team: 'T0OTHER01', user: EVE });
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), { fetch: s.fetch, url });
    svc.startConnect();
    const st = await svc.finishConnect(CODE);
    assert.deepEqual(
      [st.workspace?.id, st.owners.map((o) => o.id), st.allow, st.notify.target],
      ['T0OTHER01', [EVE], [], 'dm'],
    );
  } finally {
    l.w.cleanup();
  }
});

test('Remove: the link is revoked at the service and forgotten here, journaled; an unreachable service still loses it here', async () => {
  for (const down of [false, true]) {
    const l = liveWorld();
    try {
      connected(l.w);
      const s = scoutLinks(l, { down });
      const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), { fetch: s.fetch, url });
      await until(() => svc.status().state === 'online', 'link online');
      const st = await svc.disconnect();
      assert.deepEqual(
        [s.calls[0].method, s.calls[0].url, s.calls[0].headers.authorization],
        ['DELETE', 'https://scout.test/link', `Bearer ${LINK.token}`],
      );
      assert.deepEqual([st.connected, st.state, st.owners], [false, 'off', []]);
      assert.deepEqual(readJson(path.join(l.w.configDir, 'credentials.json')), {});
      assert.equal(l.w.hub.open, 0, 'the link is closed');
      assert.deepEqual(
        journalFile(l.w.root)
          .readSlack(SLACK_JOURNAL)
          .map((e) => [e.action, e.user]),
        [['disconnected', ANA]],
      );
    } finally {
      l.w.cleanup();
    }
  }
});

test('an old own-app setup is shown as such, never connects, and its tokens go when Scout is connected', async () => {
  const l = liveWorld();
  try {
    writeJsonAtomic(path.join(l.w.configDir, 'credentials.json'), {
      github: { token: 'kept' },
      slack: { appToken: 'xapp-old', botToken: 'xoxb-old' },
    });
    writeJsonAtomic(path.join(l.w.configDir, 'slack.json'), { enabled: true, appId: 'A0OLD', owners: [{ id: ANA }] });
    const s = scoutLinks(l);
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), { fetch: s.fetch, url });
    const st = svc.status();
    assert.deepEqual([st.legacy, st.connected, st.state, st.owners], [true, false, 'off', []]);
    assert.equal(l.w.hub.connections, 0);
    svc.startConnect();
    await svc.finishConnect(CODE);
    assert.deepEqual(readJson(path.join(l.w.configDir, 'credentials.json')), {
      github: { token: 'kept' },
      slack: { link: LINK },
    });
    assert.equal(svc.status().legacy, undefined);
  } finally {
    l.w.cleanup();
  }
});

test('the link: hello with the token, the same link after a drop, too-fast backs off, closed for good turns Slack off', async () => {
  const l = liveWorld();
  try {
    connected(l.w);
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }));
    await until(() => svc.status().state === 'online', 'online');
    l.w.hub.drop();
    await until(() => l.w.hub.connections === 2 && svc.status().state === 'online', 'reconnect after a drop');
    l.w.hub.closeLink('too-fast');
    await until(() => l.w.hub.connections === 3 && svc.status().state === 'online', 'reconnect after too-fast');
    l.w.hub.closeLink('uninstalled');
    await until(() => svc.status().state === 'auth-error', 'closed for good');
    const st = svc.status();
    assert.match(st.error!, /removed from this Slack workspace/);
    assert.equal(st.enabled, false);
    assert.equal(l.w.hub.connections, 3, 'no reconnect after the service closed the link');
  } finally {
    l.w.cleanup();
  }
});

test('a link token the service no longer knows is refused at hello: Slack turns off and asks to connect again', async () => {
  const l = liveWorld();
  try {
    connected(l.w);
    l.w.hub.state.token = 'stl_another';
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }));
    await until(() => svc.status().state === 'auth-error', 'refused');
    assert.match(svc.status().error!, /no longer knows this Teamtrail/);
  } finally {
    l.w.cleanup();
  }
});

test('a second teamtrail, without the Slack connection, refuses to connect or disconnect', async () => {
  const l = liveWorld();
  try {
    connected(l.w);
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }));
    await until(() => svc.status().state === 'online', 'online');
    const other = l.w.service(new MemoryAdapter({ latency: [0, 0] }));
    assert.equal(other.status().state, 'elsewhere');
    assert.throws(() => other.startConnect(), /connected from another Teamtrail \(.*tracker\)/);
    await assert.rejects(other.disconnect(), /connected from another Teamtrail/);
    assert.equal(svc.status().connected, true);
  } finally {
    l.w.cleanup();
  }
});

test('journal: transitions from the first versions, Slack owner changes old and new, and kinds from the future', () => {
  const { w } = liveWorld();
  try {
    const j = journalFile(w.root);
    const transition = {
      v: 1 as const,
      at: 1,
      mapId: SLACK_JOURNAL,
      ticketId: '1',
      ticketKey: '#1',
      event: 'claim' as const,
      from: 'ready' as const,
      to: 'working' as const,
      actor: 'claude-01',
      actorKind: 'agent' as const,
    };
    mkdirSync(path.join(w.root, '.events'), { recursive: true });
    appendFileSync(journalPath(w.root, SLACK_JOURNAL), JSON.stringify(transition) + '\n'); // no `kind`: the oldest lines
    j.append({ ...transition, kind: 'transition', at: 2 });
    const slack = { v: 1 as const, kind: 'slack' as const, mapId: SLACK_JOURNAL, user: ANA, name: 'ana' };
    j.append({ ...slack, at: 3, action: 'owner-confirmed', via: 'code', actor: 'trail lead', actorKind: 'trail lead' });
    j.append({ ...slack, at: 4, action: 'connected', via: 'oauth', actor: 'trail lead', actorKind: 'trail lead' });
    appendFileSync(journalPath(w.root, SLACK_JOURNAL), '{"v":1,"kind":"from-the-future","at":5,"mapId":"x"}\n{"torn":');
    assert.deepEqual(
      j.read(SLACK_JOURNAL).map((e) => e.at),
      [1, 2],
    );
    assert.deepEqual(
      j.readSlack(SLACK_JOURNAL).map((e) => [e.at, e.action, e.via]),
      [
        [3, 'owner-confirmed', 'code'],
        [4, 'connected', 'oauth'],
      ],
    );
  } finally {
    w.cleanup();
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type View = { blocks: Record<string, any>[] };
const buttons = (view: View): string[] =>
  view.blocks
    .filter((b) => b.type === 'actions')
    .flatMap((b) => (b.elements as { action_id: string }[]).map((e) => e.action_id));

test('Home tab: nothing to click until connected; the owner is named; names are mentions only of real ids', () => {
  const o = { url: 'http://127.0.0.1:7420/', command: '/scout' };
  const text = (v: View) => v.blocks[0].text.text as string;
  assert.deepEqual(buttons(homeView({ kind: 'idle' }, o)), []);
  assert.match(text(homeView({ kind: 'idle' }, o)), /Add Scout to Slack/);
  assert.deepEqual(buttons(homeView({ kind: 'yours', owner: ANA }, o)), ['open_teamtrail']);
  assert.equal(text(homeView({ kind: 'connected', owner: ANA }, o)), `Connected to Teamtrail for <@${ANA}>.`);
  assert.doesNotMatch(text(homeView({ kind: 'connected', owner: '!channel' }, o)), /<[!@]/);
});

test('attack: frames that are null, not objects, malformed or huge never take this process down', async () => {
  const l = liveWorld();
  try {
    connected(l.w);
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }));
    await until(() => svc.status().state === 'online', 'online');
    for (const frame of [
      'null',
      '[]',
      '"x"',
      '1',
      '{"type":1}',
      '{"type":"envelope"}',
      '{"type":"envelope","id":"e","envelope":null}',
      '{"type":"result"}',
      'x'.repeat(1_000_001),
      '{',
    ])
      l.w.hub.raw(frame);
    l.w.hub.raw(
      JSON.stringify({
        type: 'envelope',
        id: 'big',
        envelope: { type: 'slash_commands', payload: { x: 'y'.repeat(1_000_000) } },
      }),
    );
    await svc.idle();
    assert.equal(svc.status().state, 'online', 'still connected');
    assert.equal(l.w.hub.sent.length, 0, 'nothing malformed or oversized was acked');
  } finally {
    l.w.cleanup();
  }
});

test('an envelope before the service said who this link is is ignored; a ready for another workspace closes the link', async () => {
  const l = liveWorld();
  try {
    connected(l.w);
    l.w.hub.state.token = 'not-yet'; // the service never says ready
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }));
    await until(() => l.w.hub.state.hello > 0, 'hello');
    l.w.hub.raw(
      JSON.stringify({
        type: 'envelope',
        id: 'early',
        envelope: {
          envelope_id: 'early',
          type: 'slash_commands',
          payload: { command: '/scout', text: 'help', team_id: 'T0EFIKA01', user_id: ANA },
        },
      }),
    );
    await svc.idle();
    assert.deepEqual(l.w.hub.sent, [], 'not handled, not acked');
    svc.close();

    const other = liveWorld();
    connected(other.w);
    other.w.hub.state.team = 'T0OTHER01';
    const svc2 = other.w.service(new MemoryAdapter({ latency: [0, 0] }));
    await until(() => svc2.status().state === 'auth-error', 'closed');
    assert.match(svc2.status().error!, /another Slack workspace/);
    other.w.cleanup();
  } finally {
    l.w.cleanup();
  }
});

test('the link token goes only to the service it was made with: another $TEAMTRAIL_SCOUT_SERVICE gets no hello', async () => {
  const l = liveWorld();
  try {
    connected(l.w);
    const s = scoutLinks(l);
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), {
      env: { TEAMTRAIL_SCOUT_SERVICE: 'https://scout.example' },
      fetch: s.fetch,
    });
    const st = svc.status();
    assert.equal(st.state, 'other-service');
    assert.match(
      st.error!,
      /Connected through https:\/\/scout\.test, but this Teamtrail now points at https:\/\/scout\.example/,
    );
    assert.equal(l.w.hub.connections, 0, 'no socket, no hello');
    await svc.disconnect();
    assert.deepEqual(
      s.calls.map((c) => [c.method, c.url]),
      [['DELETE', 'https://scout.test/link']],
      'revoked where it was made, never at the new address',
    );
  } finally {
    l.w.cleanup();
  }
});

test('Connect as @user in <workspace>? is asked before anything is saved; Cancel saves nothing', async () => {
  const l = liveWorld();
  try {
    const s = scoutLinks(l);
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), { fetch: s.fetch, url });
    svc.startConnect();
    const who = await svc.previewConnect(CODE);
    assert.deepEqual(who, { workspace: { id: 'T0EFIKA01', name: 'efika' }, user: { id: ANA, name: 'ana' } });
    assert.equal(s.calls[0].url, 'https://scout.test/link/preview');
    assert.equal(svc.status().connected, false, 'nothing saved yet');
    assert.equal(existsSync(path.join(l.w.configDir, 'credentials.json')), false);
    svc.cancelConnect();
    await assert.rejects(svc.finishConnect(CODE), /Nothing is waiting to connect/, 'Cancel dropped the verifier');
    svc.startConnect();
    await svc.previewConnect(CODE);
    assert.equal((await svc.finishConnect(CODE)).connected, true, 'Connect after the preview links');
  } finally {
    l.w.cleanup();
  }
});

test('a connect started in another project of this Lookout comes back to that project', async () => {
  const l = liveWorld();
  try {
    const svc = l.w.service(new MemoryAdapter({ latency: [0, 0] }), { url });
    const back = (project?: string) =>
      new URL(svc.startConnect({ port: 7461, project }).url).searchParams.get('return');
    assert.equal(back('a1b2c3d4'), 'http://127.0.0.1:7461/?project=a1b2c3d4&settings=slack');
    assert.equal(back(), 'http://127.0.0.1:7461/?settings=slack');
    assert.equal(back('../evil'), 'http://127.0.0.1:7461/?settings=slack', 'only a project id');
  } finally {
    l.w.cleanup();
  }
});
