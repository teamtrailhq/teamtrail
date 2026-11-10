/**
 * Who Scout talks to in Slack. The attack: any workspace member who opened the app's Home tab first could click
 * "This is me", become the owner, receive every agent question and approval, and answer them. Now the trail lead
 * proves it from their own machine: a one-time code from the Lookout, entered in Slack, then confirmed in the Lookout.
 */
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { journalFile, journalPath } from '../../core/src/history/journalFile';
import { SLACK_JOURNAL } from '../../core/src/model/lifecycle';
import { homeView } from '../src/blocks';
import { settleOwners } from '../src/owners';
import { ANA, CODE, EVE, RAJ, TOKENS, agentDoc, connected, freezeTime, liveWorld, until } from './harness';
import { approvalTrail, eventStore, posted } from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

const question = (id: string) => ({ id, text: 'Postgres or SQLite?', suggestions: ['Postgres'], at: Date.now() });

/** Tokens pasted, socket online, nobody matched by email: the state the old "This is me" button appeared in. */
async function freshSetup(extra = {}) {
  const l = liveWorld();
  const { a, map } = await eventStore();
  const svc = l.w.service(a, extra);
  await svc.pasteToken(TOKENS.app);
  await svc.pasteToken(TOKENS.bot);
  await until(() => svc.status().state === 'online', 'socket online');
  agentDoc(l.w.root, { sid: 's1', mapId: map.id, pending: [question('q1')] });
  return { ...l, svc, map };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type View = { blocks: Record<string, any>[] };
const buttons = (view: View): string[] =>
  view.blocks
    .filter((b) => b.type === 'actions')
    .flatMap((b) => (b.elements as { action_id: string }[]).map((e) => e.action_id));

test('attack: the first member to click on the Home tab does not become the owner, and is sent nothing', async () => {
  const { w, svc, calls } = await freshSetup();
  try {
    await w.send(svc, 'eve opens Home', (f) => f.payload.homeOpened(EVE));
    assert.deepEqual(buttons(calls('views.publish')[0].view), [], 'no "This is me": nothing to click');
    await w.send(svc, 'eve sends the old claim click anyway', (f) => f.payload.clickHome(EVE, 'claim_owner'));
    await svc.tick();
    const s = svc.status();
    assert.deepEqual([s.step, s.owners, s.pendingOwner], [5, [], undefined]);
    assert.equal(calls('views.open').length, 0, 'no modal without a code from the Lookout');
    assert.equal(calls('chat.postMessage').length, 0, 'no question, approval or greeting reaches anyone');
    assert.equal(calls('conversations.open').length, 0);
  } finally {
    w.cleanup();
  }
});

test('the code: the account that enters it is only put forward; the trail lead confirms it; then questions arrive', async () => {
  const { w, svc, calls } = await freshSetup();
  try {
    const { code, expiresAt, status } = svc.startOwnerCode();
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(expiresAt, Date.now() + 10 * 60_000);
    assert.deepEqual(status.ownerCode, { expiresAt }, 'status says a code waits, never which');
    assert.ok(!JSON.stringify(svc.status()).includes(CODE), 'no later status carries the code');

    await w.send(svc, 'ana opens Home', (f) => f.payload.homeOpened(ANA));
    assert.deepEqual(buttons(calls('views.publish').at(-1)!.view), ['claim_owner']);
    await w.send(svc, 'ana clicks Enter code', (f) => f.payload.clickHome(ANA, 'claim_owner'));
    const ack = await w.send(svc, 'ana enters it in lower case with spaces', (f) =>
      f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { code: ' k7qf 2m9x ' }),
    );
    assert.equal(ack, undefined, 'the modal closes');
    await svc.tick();
    const pending = svc.status();
    assert.deepEqual(
      [pending.step, pending.owners, pending.pendingOwner, pending.ownerCode],
      [5, [], { id: ANA, name: 'ana', realName: 'Ana Silva', via: 'code' }, undefined],
    );
    assert.equal(calls('chat.postMessage').length, 0, 'entering the code delivers nothing yet');
    assert.match(calls('views.publish').at(-1)!.view.blocks[0].text.text, /confirm that this is your Slack account/);

    await assert.rejects(svc.confirmOwner(EVE), /no longer waiting/, 'confirming names the account that was shown');
    const done = await svc.confirmOwner(ANA);
    assert.deepEqual([done.step, done.owners[0].id, done.owners[0].confirmedAt], ['done', ANA, Date.now()]);
    await svc.tick();
    assert.deepEqual(
      calls('chat.postMessage').map((m) => [m.channel, m.text.slice(0, 12)]),
      [
        ['D00ANA0001', 'Connected. D'],
        ['D00ANA0001', 'Awaiting you'],
      ],
    );
    assert.throws(() => svc.startOwnerCode(), /already confirmed/, 'a new code needs a reset first');
  } finally {
    w.cleanup();
  }
});

test('the code works once: of two accounts submitting it at the same moment, only the first is put forward', async () => {
  const { w, svc, fake } = await freshSetup();
  try {
    const { code } = svc.startOwnerCode();
    await w.send(svc, 'ana clicks Enter code', (f) => f.payload.clickHome(ANA, 'claim_owner'));
    const anaView = [...fake.views.keys()].at(-1)!;
    await w.send(svc, 'eve clicks Enter code', (f) => f.payload.clickHome(EVE, 'claim_owner'));
    const eveView = [...fake.views.keys()].at(-1)!;
    // Both envelopes are on the socket before either is handled.
    const [first, second] = await Promise.all([
      w.hub.envelope(fake.payload.submit(ANA, anaView, { code })),
      w.hub.envelope(fake.payload.submit(EVE, eveView, { code })),
    ]);
    await svc.idle();
    assert.equal(first, undefined);
    assert.match((second as { errors: { code: string } }).errors.code, /No code is waiting/);
    assert.equal(svc.status().pendingOwner?.id, ANA, 'the later submission did not overwrite the first');
    assert.deepEqual(svc.status().owners, []);
  } finally {
    w.cleanup();
  }
});

test('the code: wrong guesses run out per account and then for everyone; it expires; a new one replaces the old', async () => {
  let now = Date.now();
  const { w, svc, fake } = await freshSetup({ now: () => now });
  const submit = async (user: string, code: string) => {
    await w.hub.envelope(fake.payload.clickHome(user, 'claim_owner'));
    await svc.idle();
    const view = [...fake.views.keys()].at(-1)!;
    const ack = await w.hub.envelope(fake.payload.submit(user, view, { code }));
    await svc.idle();
    return (ack as { errors?: { code: string } } | undefined)?.errors?.code ?? 'ok';
  };
  try {
    svc.startOwnerCode();
    for (let i = 0; i < 5; i++) assert.match(await submit(EVE, 'AAAA-AAAA'), /doesn't match/);
    assert.match(await submit(EVE, CODE), /Too many tries/, 'a sixth try is refused even with the right code');
    for (let i = 0; i < 5; i++) await submit(RAJ, 'BBBB-BBBB');
    for (let n = 1; n <= 8; n++) for (let i = 0; i < 5; i++) fakeTry(`U0X00000${n}`);
    assert.equal(svc.status().ownerCode, undefined, 'fifty wrong tries in all drop the code');
    assert.match(await submitAfterDrop(), /No code is waiting/);

    const second = svc.startOwnerCode();
    now = second.expiresAt + 1;
    assert.equal(svc.status().ownerCode, undefined, 'expired after ten minutes');
    svc.startOwnerCode();
    now += 1000;
    assert.equal(await submit(ANA, CODE), 'ok');
    assert.equal(svc.status().pendingOwner?.id, ANA);
  } finally {
    w.cleanup();
  }

  /** Wrong tries from accounts the fake has no Home for: straight to the handler, as Slack would deliver them. */
  function fakeTry(user: string) {
    void svc.onEnvelope({
      envelope_id: 'x',
      type: 'interactive',
      payload: {
        type: 'view_submission',
        team: { id: fake.team.id },
        api_app_id: fake.app.id,
        user: { id: user },
        view: { callback_id: 'owner_code_modal', state: { values: { code: { value: { value: 'CCCC-CCCC' } } } } },
      },
    });
  }
  async function submitAfterDrop() {
    const r = await svc.onEnvelope({
      envelope_id: 'y',
      type: 'interactive',
      payload: {
        type: 'view_submission',
        team: { id: fake.team.id },
        api_app_id: fake.app.id,
        user: { id: ANA },
        view: { callback_id: 'owner_code_modal', state: { values: { code: { value: { value: CODE } } } } },
      },
    });
    return (r as { ack: { errors: { code: string } } }).ack.errors.code;
  }
});

test('reset: no owner, nobody put forward, no code; delivery stops and the former owner can no longer act', async () => {
  const l = liveWorld();
  const { w, calls, replies } = l;
  try {
    const { a, map, api } = await approvalTrail(w);
    connected(w, { allow: [RAJ] });
    const svc = w.service(a);
    await until(() => svc.status().state === 'online');
    await svc.tick();
    const before = calls('chat.postMessage').length;
    assert.equal(before, 2, 'the approvals reached the confirmed owner');

    const s = svc.resetOwner();
    assert.deepEqual([s.step, s.owners, s.pendingOwner, s.ownerCode], [5, [], undefined, undefined]);
    agentDoc(w.root, { sid: 's9', mapId: map.id, pending: [question('q9')] });
    await svc.tick();
    assert.equal(calls('chat.postMessage').length, before, 'nothing more is sent');
    for (const user of [ANA, RAJ]) {
      await w.send(svc, `${user} clicks Approve after the reset`, (f) =>
        f.payload.click(user, ...posted(f, 'Approve'), 'verify_approve'),
      );
      assert.match(replies().at(-1)!.text, /^Only the Teamtrail owner/);
    }
    const ticket = (await a.loadMap(map.id)).tickets.find((t) => t.id === api.id)!;
    assert.equal(ticket.state, 'open', 'allowed users are allowed by an owner: without one, nobody acts');
  } finally {
    w.cleanup();
  }
});

test('owner changes are journaled: put forward, confirmed, reset; never the code', async () => {
  const { w, svc } = await freshSetup();
  try {
    const { code } = svc.startOwnerCode();
    await w.send(svc, 'ana clicks Enter code', (f) => f.payload.clickHome(ANA, 'claim_owner'));
    await w.send(svc, 'ana enters the code', (f) => f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { code }));
    await svc.confirmOwner(ANA);
    svc.resetOwner();
    const entries = journalFile(w.root).readSlack(SLACK_JOURNAL);
    assert.deepEqual(
      entries.map((e) => [e.action, e.user, e.via, e.actor, e.actorKind]),
      [
        ['owner-claimed', ANA, 'code', 'teamtrail', 'engine'],
        ['owner-confirmed', ANA, 'code', 'trail lead', 'trail lead'],
        ['owner-reset', ANA, 'code', 'trail lead', 'trail lead'],
      ],
    );
    assert.ok(!JSON.stringify(entries).includes(CODE) && !JSON.stringify(entries).includes('xox'));
  } finally {
    w.cleanup();
  }
});

test('journal: transitions from the first versions, Slack owner changes and kinds from the future read side by side', () => {
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
    j.append({
      v: 1,
      kind: 'slack',
      at: 3,
      mapId: SLACK_JOURNAL,
      action: 'owner-confirmed',
      user: ANA,
      name: 'ana',
      via: 'code',
      actor: 'trail lead',
      actorKind: 'trail lead',
    });
    appendFileSync(journalPath(w.root, SLACK_JOURNAL), '{"v":1,"kind":"from-the-future","at":4,"mapId":"x"}\n{"torn":');
    assert.deepEqual(
      j.read(SLACK_JOURNAL).map((e) => e.at),
      [1, 2],
    );
    assert.deepEqual(
      j.readAll(SLACK_JOURNAL).map((e) => e.at),
      [1, 2],
    );
    assert.deepEqual(
      j.readSlack(SLACK_JOURNAL).map((e) => [e.at, e.action, e.user]),
      [[3, 'owner-confirmed', ANA]],
    );
    assert.deepEqual(j.readGuides(SLACK_JOURNAL), []);
  } finally {
    w.cleanup();
  }
});

/* ---------- installs from before the code ---------- */

test('existing install, owner set by "This is me", by git email, or unmarked: dropped, never offered for one-click confirmation', async () => {
  for (const legacy of ['home', 'unmarked', 'git-email'] as const) {
    const { w, calls, replies } = liveWorld();
    try {
      const { a, map, api } = await approvalTrail(w);
      connected(w, { legacy, allow: [RAJ] });
      const svc = w.service(a);
      await until(() => svc.status().state === 'online');
      const s = svc.status();
      assert.deepEqual([s.step, s.owners, s.pendingOwner], [5, [], undefined], legacy);
      assert.deepEqual(s.ownerRedo, { was: { id: ANA, name: 'ana' }, via: legacy === 'unmarked' ? 'home' : legacy });
      await assert.rejects(svc.confirmOwner(ANA), /no longer waiting/, `${legacy}: no one-click confirm`);
      await svc.tick();
      assert.equal(calls('chat.postMessage').length, 0, 'nothing is sent to the old owner');
      await w.send(svc, 'ana approves on an old message', (f) => f.payload.homeOpened(ANA));
      assert.equal((await a.loadMap(map.id)).tickets.find((t) => t.id === api.id)!.state, 'open');
      assert.equal(replies().length, 0);

      // The way back: a code shown here, entered by the account, confirmed here.
      const { code } = svc.startOwnerCode();
      await w.send(svc, 'ana clicks Enter code', (f) => f.payload.clickHome(ANA, 'claim_owner'));
      await w.send(svc, 'ana enters it', (f) => f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { code }));
      const done = await svc.confirmOwner(ANA);
      assert.deepEqual([done.step, done.owners[0].via, done.allow, done.ownerRedo], ['done', 'code', [{ id: RAJ }], undefined]);
    } finally {
      w.cleanup();
    }
  }
});

test('settleOwners: only an owner confirmed here stays; anything else, or anyone put forward without the code, is dropped', () => {
  const home = { id: ANA, name: 'ana', via: 'home' as const };
  assert.deepEqual(settleOwners({ owners: [home] }), {
    owners: [],
    pendingOwner: undefined,
    ownerRedo: { was: { id: ANA, name: 'ana' }, via: 'home' },
  });
  assert.deepEqual(settleOwners({ owners: [{ id: ANA, via: 'git-email' }] }).ownerRedo?.via, 'git-email');
  const confirmed = { id: ANA, via: 'code' as const, confirmedAt: 5 };
  assert.deepEqual(settleOwners({ owners: [confirmed], pendingOwner: { id: EVE, via: 'code' } }), {
    owners: [confirmed],
    pendingOwner: undefined,
    ownerRedo: undefined,
  });
  assert.deepEqual(settleOwners({ owners: [{ id: EVE, via: 'code' }] }).owners, [], 'via alone confirms nothing');
  for (const via of ['home', 'git-email', undefined] as const)
    assert.equal(settleOwners({ pendingOwner: { id: EVE, via } }).pendingOwner, undefined, `pending via ${via}`);
  assert.deepEqual(settleOwners({ pendingOwner: { id: EVE, via: 'code' } }).pendingOwner, { id: EVE, via: 'code' });
  assert.deepEqual(settleOwners({}), { owners: [], pendingOwner: undefined, ownerRedo: undefined });
});

/* ---------- the Home tab ---------- */

test('Home tab: a button only while a code waits; the owner is named only once confirmed', () => {
  const o = { url: 'http://localhost:7420/', command: '/scout' };
  const text = (v: View) => v.blocks[0].text.text as string;
  assert.deepEqual(buttons(homeView({ kind: 'idle' }, o)), []);
  assert.match(text(homeView({ kind: 'idle' }, o)), /isn't connected to anyone yet/);
  assert.deepEqual(buttons(homeView({ kind: 'code' }, o)), ['claim_owner']);
  assert.deepEqual(buttons(homeView({ kind: 'confirm' }, o)), []);
  assert.deepEqual(buttons(homeView({ kind: 'yours', owner: ANA }, o)), ['open_teamtrail']);
  assert.equal(text(homeView({ kind: 'connected', owner: ANA }, o)), `Connected to Teamtrail for <@${ANA}>.`);
  assert.doesNotMatch(text(homeView({ kind: 'connected', owner: '!channel' }, o)), /<[!@]/);
});

test('Home tab while an account waits to be confirmed: that account is told where; everyone else has nothing to click', async () => {
  const { w, svc, calls } = await freshSetup();
  try {
    const { code } = svc.startOwnerCode();
    await w.send(svc, 'ana clicks Enter code', (f) => f.payload.clickHome(ANA, 'claim_owner'));
    await w.send(svc, 'ana enters the code', (f) => f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { code }));
    await w.send(svc, 'eve opens Home', (f) => f.payload.homeOpened(EVE));
    const eve = calls('views.publish').at(-1)!;
    assert.equal(eve.user_id, EVE);
    assert.deepEqual(buttons(eve.view), []);
    assert.doesNotMatch(JSON.stringify(eve.view), new RegExp(ANA), 'who is setting up is not told to others');
    const opened = calls('views.open').length;
    await w.send(svc, 'eve sends a claim click', (f) => f.payload.clickHome(EVE, 'claim_owner'));
    assert.equal(calls('views.open').length, opened, 'no modal once someone is put forward');
    assert.equal(svc.status().pendingOwner?.id, ANA);
  } finally {
    w.cleanup();
  }
});

test('Remove: the code, the account put forward and the owner are forgotten', async () => {
  const { w, svc } = await freshSetup();
  try {
    svc.startOwnerCode();
    assert.ok(svc.status().ownerCode);
    svc.remove();
    assert.deepEqual(
      [svc.status().ownerCode, svc.status().pendingOwner, svc.status().owners],
      [undefined, undefined, []],
    );
  } finally {
    w.cleanup();
  }
});
