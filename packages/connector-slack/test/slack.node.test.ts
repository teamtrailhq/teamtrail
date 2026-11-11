import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryAdapter } from '@teamtrail/core';
import { createTrackerBridge } from '@teamtrail/core/bridge';
import { FIXTURES } from '../../core/test/fixtures';
import { BOT_SCOPES, appIdFromToken, slackLinks, slackManifest, tokenKind } from '../src/manifest';
import { slackPlugin, slackRoutes } from '../src/node';
import { SocketMode } from '../src/socket';
import { deterministicSummary, plainText } from '../src/summary';
import { fakeSlack } from './fakes/slack';
import { socketHub } from './fakes/socket';
import {
  ALL_SCOPES,
  ANA,
  FROZEN,
  RAJ,
  TOKENS,
  URL_,
  connected,
  freezeTime,
  until,
  world,
  type SlackFixture,
} from './harness';
import {
  approvalFlow,
  approvalRestartFlow,
  askFlow,
  decisionFlow,
  notifyFlow,
  setupFlow,
  statusFlow,
} from './scenarios';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

const fixture = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as SlackFixture;
const posts = (fx: SlackFixture, method: string) =>
  fx.exchanges.filter((e) => e.req.url.startsWith(`/api/${method}`)).map((e) => e.req.body as Record<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any
const responses = (fx: SlackFixture) =>
  fx.exchanges.filter((e) => e.req.url.startsWith('/actions/')).map((e) => e.req.body as Record<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any

async function replayed<T>(name: string, flow: (w: ReturnType<typeof world>) => Promise<T>) {
  const w = world('replay', name);
  try {
    const r = await flow(w);
    w.done();
    return r;
  } finally {
    w.cleanup();
  }
}

test('setup: tokens are routed by prefix, checked live, stored only in the local credential store; the owner enters a one-time code and is confirmed here', async () => {
  const r = await replayed('slack-setup.json', setupFlow);
  assert.equal(r.s0.step, 1);
  assert.equal(r.s1.step, 2);
  assert.deepEqual([r.userToken.ok, r.userToken.code], [false, 'user_token']);
  assert.deepEqual(
    [r.app.ok, r.app.kind, r.app.status.step, r.app.status.setup.appId],
    [true, 'app', 4, 'A0Scout0001'],
  );
  assert.equal(r.app.status.links.install, 'https://api.slack.com/apps/A0Scout0001/install-on-team');
  assert.deepEqual([r.missingScope.ok, r.missingScope.code], [false, 'missing_scope']);
  assert.match(r.missingScope.error!, /users:read/);
  assert.deepEqual([r.bot.ok, r.bot.kind, r.bot.status.enabled], [true, 'bot', true]);
  assert.deepEqual([r.beforeClaim.state, r.beforeClaim.step], ['online', 5]);
  assert.equal(r.beforeClaim.links.home, 'slack://app?team=T0EFIKA01&id=A0Scout0001&tab=home');
  assert.deepEqual(
    [r.noCode.step, r.noCode.owners, r.noCode.pendingOwner],
    [5, [], undefined],
    'a click claims nothing',
  );
  assert.deepEqual(r.wrong, {
    response_action: 'errors',
    errors: { code: "That code doesn't match. Check it in Teamtrail → Settings → Slack." },
  });
  assert.deepEqual(
    [r.pending.step, r.pending.owners, r.pending.pendingOwner, r.pending.ownerCode],
    [5, [], { id: ANA, name: 'ana', displayName: 'ana', realName: 'Ana Silva', via: 'code' }, undefined],
    'the account that entered the code waits for the trail lead; the code is used up',
  );
  assert.deepEqual(
    [r.after.step, r.after.owners, r.after.pendingOwner],
    [
      'done',
      [{ id: ANA, name: 'ana', displayName: 'ana', realName: 'Ana Silva', via: 'code', confirmedAt: FROZEN }],
      undefined,
    ],
  );
  assert.deepEqual(r.creds, { slack: { appToken: TOKENS.app, botToken: TOKENS.bot } });
  assert.ok(
    !JSON.stringify(r.settings).includes('xox') && !JSON.stringify(r.settings).includes('xapp'),
    'slack.json holds no secrets',
  );
  assert.ok(
    !JSON.stringify(r.after).includes(TOKENS.bot) && !JSON.stringify(r.after).includes(TOKENS.app),
    'status never echoes a token',
  );
  assert.equal(r.socketConnections, 2, 'one probe socket on paste, then the live one');
  const fx = fixture('slack-setup.json');
  assert.deepEqual(
    posts(fx, 'chat.postMessage').map((m) => [m.channel, m.text]),
    [['D00ANA0001', 'Connected. Decisions and questions will reach you here.']],
    'one message, to the confirmed owner, after the confirmation',
  );
  assert.equal(posts(fx, 'views.open').length, 2, 'the code modal opens only while a code waits and nobody used it');
  assert.ok(!JSON.stringify(fx).includes(TOKENS.bot), 'fixtures never contain tokens');
});

test('asks: DM to the owner, buttons answer the waiting agent, late and unauthorized clicks are refused, UI answers close the DM', async () => {
  const r = await replayed('slack-ask.json', askFlow);
  // each answer carries this machine's signature, so the waiting agent knows Teamtrail wrote it, not the agent
  const unsigned = ({ sig, sigVia, ...a }: Record<string, unknown>) => (
    assert.match(String(sig), /^[0-9a-f]{64}$/),
    assert.match(String(sigVia), /^[0-9a-f]{64}$/, 'and how it was given, Slack, is signed too'),
    a
  );
  assert.deepEqual(
    { ...unsigned(r.answer1), at: 0 },
    { sessionId: 's1', questionId: 'q1', text: 'Postgres', author: `slack:${ANA}`, at: 0, via: 'slack' },
  );
  assert.deepEqual(
    { ...unsigned(r.answer3), at: 0 },
    { sessionId: 's3', questionId: 'q3', text: 'event_log', author: `slack:${ANA}`, at: 0, via: 'slack' },
  );
  assert.deepEqual(r.answers.sort(), ['s1', 's3'], 'refused, late and UI answers write nothing');
  assert.ok(
    Object.values(r.asks).every((a) => (a as { closed?: boolean }).closed),
    'every ask message lost its buttons',
  );

  const fx = fixture('slack-ask.json');
  const [ask] = posts(fx, 'chat.postMessage');
  assert.equal(ask.channel, 'D00ANA0001');
  assert.match(
    ask.blocks[0].text.text,
    /^◆ \*AWAITING YOU\* · Event store · #3 Pick DB · claude-07\n>Postgres or SQLite/,
  );
  assert.deepEqual(
    ask.blocks[1].elements.map((e: { text: { text: string } }) => e.text.text),
    ['Postgres', 'SQLite', 'Reply…', 'Open in Teamtrail'],
  );
  assert.equal(ask.blocks[1].elements[3].url, URL_);
  const updates = posts(fx, 'chat.update').map((u) => u.text);
  assert.deepEqual(updates, [
    `✓ Answered by <@${ANA}> via Slack: “Postgres”. claude-07 resumed.`,
    '✓ Answered in Teamtrail by trail lead: “90 days”.',
    `✓ Answered by <@${ANA}> via Slack: “event_log”. claude-09 resumed.`,
    'No longer waiting: claude-07 session ended.',
  ]);
  assert.ok(posts(fx, 'chat.update').every((u) => !u.blocks.some((b: { type: string }) => b.type === 'actions')));
  assert.deepEqual(
    responses(fx).map((b) => b.text),
    [
      'Only the Teamtrail owner and allowed users can do that. Ask the owner to add you in Teamtrail Settings → Slack.',
      'Already answered in Teamtrail.',
      'Nothing is waiting on you.',
    ],
  );
  assert.deepEqual(fx.envelopes.find((e) => e.label === 'ana submits an empty reply')!.ack, {
    response_action: 'errors',
    errors: { answer: 'Enter an answer' },
  });
});

test('Save as decision: modal defaults to resolving the related ticket; the record carries source, permalink, participants and summary; the tracker is updated', async () => {
  const r = await replayed('slack-decision.json', decisionFlow);
  const db = r.snap.tickets.find((t) => t.id === r.dbId)!;
  assert.equal(db.state, 'closed');
  assert.equal(db.closeReason, 'completed');
  assert.match(db.comments.at(-1)!.body, /^\*\*Resolution\*\*\n\nUse Postgres; SQLite for tests\. See the bench\./);
  assert.equal(db.comments.at(-1)!.author, `slack:${ANA}`);
  const [rec] = r.records;
  assert.equal(rec.ticketId, r.dbId);
  assert.equal(rec.decidedBy, `slack:${ANA}`);
  assert.equal(rec.answer, 'Use Postgres; SQLite for tests. See the bench.');
  assert.deepEqual(rec.source, {
    kind: 'slack',
    ref: 'C0INFRA01/1793448003.000004',
    url: 'https://efika.slack.com/archives/C0INFRA01/p1793448003000004',
    label: '#infra',
    meta: {
      workspaceId: 'T0EFIKA01',
      channelId: 'C0INFRA01',
      channelName: 'infra',
      threadTs: '1793448000.000001',
      messageTs: '1793448003.000004',
    },
  });
  assert.deepEqual(rec.participants, [
    { id: `slack:${ANA}`, name: 'ana' },
    { id: `slack:${RAJ}`, name: 'raj' },
  ]);
  assert.match(
    rec.rationale,
    /^ana: Event store: Postgres or SQLite\? @raj any numbers\?\nana: CI needs/,
    'deterministic summary, Slack markup resolved',
  );
  assert.deepEqual(rec.transcript, [], 'summary only: no raw thread excerpt is stored');
  assert.deepEqual(r.snap.map.sections.decisions.at(-1), {
    ticketId: r.dbId,
    ticketKey: '#3',
    text: 'Use Postgres; SQLite for tests. ([Slack](https://efika.slack.com/archives/C0INFRA01/p1793448003000004), 2026-10-31)',
  });

  const trail = r.all.find((d) => d.decidedBy === `slack:${RAJ}`)!;
  assert.equal(trail.ticketId, undefined);
  assert.equal(
    trail.source.url,
    'https://efika.slack.com/archives/G0ScoutTST',
    '/scout decide outside a thread links the channel',
  );
  assert.equal(r.after.map.sections.decisions.length, 2);

  const fx = fixture('slack-decision.json');
  const form = posts(fx, 'views.update')[0].view;
  assert.equal(
    form.blocks.find((b: { block_id?: string }) => b.block_id === 'mode').element.initial_option.value,
    'resolve',
  );
  assert.equal(
    form.blocks.find((b: { block_id?: string }) => b.block_id === 'ticket').element.initial_option.value,
    r.dbId,
    'the claimed decision ticket is pre-selected',
  );
  const switched = posts(fx, 'views.update')[1].view;
  assert.equal(
    switched.blocks.find((b: { block_id?: string }) => b.block_id === 'mode').element.initial_option.value,
    'new',
    'a trail with no related ticket defaults to a new decision ticket',
  );
  assert.match(
    posts(fx, 'views.update').find((u) => u.view.blocks[0].text?.text?.includes('Invite'))!.view.blocks[0].text.text,
    /Invite @Scout to #random/,
  );
  const confirm = posts(fx, 'chat.postMessage')[0];
  assert.deepEqual(
    [confirm.channel, confirm.thread_ts, confirm.text],
    ['C0INFRA01', '1793448000.000001', 'Saved to *Event store*, resolved #3 Pick DB'],
  );
  assert.deepEqual(
    responses(fx).map((b) => b.text),
    [
      'Only the Teamtrail owner and allowed users can do that. Ask the owner to add you in Teamtrail Settings → Slack.',
      'Saved to *Event store*',
    ],
  );
});

test('/scout status, inbox and help', async () => {
  const r = await replayed('slack-status.json', statusFlow);
  assert.match((r.help as { text: string }).text, /\/scout decide \[text\]/);
  assert.match((r.refused as { text: string }).text, /^Only the Teamtrail owner/);
  assert.match((r.unknown as { text: string }).text, /^Unknown command `dance`/);
  const out = responses(fixture('slack-status.json'));
  assert.match(out[0].blocks[0].text.text, /\*#1\* Event store · 0\/4 · 1 awaiting · 1 blocked/);
  assert.match(out[1].blocks[0].text.text, /Awaiting you {2}1 {2}\(#3, 12m\)\nBlocked {7}1 {2}\(#5 by #3\)/);
  assert.match(out[1].blocks[0].text.text, /Sessions {6}claude-07 waiting · \$4\.12 · 1\.8M tok/);
  assert.equal(out[2].text, 'No trail matches “nope”.');
  assert.match(out[3].blocks[0].text.text, /AWAITING YOU\* · Event store · #3 Pick DB/);
  assert.equal(out[3].blocks[1].elements[0].action_id, 'ask_reply', 'a question without suggestions offers Reply…');
});

test('notifications: blocked and trail done reach the DM, batched per trail and threaded under the first of the day', async () => {
  await replayed('slack-notify.json', notifyFlow);
  const msgs = posts(fixture('slack-notify.json'), 'chat.postMessage');
  assert.equal(msgs.length, 2, 'nothing for the baseline; one message per trail per flush');
  assert.equal(msgs[0].text, '⛔ *BLOCKED* · Event store · #2 Bench write paths is blocked by #4 Retention policy');
  assert.equal(msgs[1].thread_ts, '1793448000.000001');
  assert.match(msgs[1].text, /◉ \*TRAIL DONE\* · Event store · 4 tickets/);
  assert.doesNotMatch(msgs[1].text, /Bench write paths → /, 'a closed ticket is not counted as unblocked');
});

test('approvals: a reviewed pass and a held ticket reach the owner; Approve and Rework… decide them as the trail lead', async () => {
  const r = await replayed('slack-approvals.json', approvalFlow);
  assert.deepEqual([r.api.state, r.api.closeReason], ['closed', 'completed']);
  assert.deepEqual([r.mig.state, r.mig.status], ['open', 'rework']);
  assert.deepEqual(
    r.verdicts.map((v) => [v.by, v.byKind, v.verdict]),
    [
      ['claude-02', 'agent', 'PASS'],
      [`slack:${ANA}`, 'trail lead', 'PASS'],
      [`slack:${ANA}`, 'trail lead', 'FAIL'],
    ],
  );
  const fx = fixture('slack-approvals.json');
  const [approve, held] = posts(fx, 'chat.postMessage');
  assert.match(
    approve.blocks[0].text.text,
    /^◆ \*APPROVE\* · Event store · #2 Write API\n>claude-02 reviewed: The write path/,
  );
  assert.deepEqual(
    approve.blocks[1].elements.map((e: { text: { text: string } }) => e.text.text),
    ['Approve', 'Rework…', 'Open in Teamtrail'],
  );
  assert.match(held.blocks[0].text.text, /^⛔ \*HELD\* · Event store · #3 Migrate schema/);
  assert.deepEqual(
    held.blocks[1].elements.map((e: { text: { text: string } }) => e.text.text),
    ['Rework…', 'Open in Teamtrail'],
  );
  assert.deepEqual(
    posts(fx, 'chat.update').map((u) => u.text),
    [`✓ Approved by <@${ANA}> via Slack.`, `↺ Sent back to rework by <@${ANA}> via Slack.`],
  );
  assert.ok(posts(fx, 'chat.update').every((u) => !u.blocks.some((b: { type: string }) => b.type === 'actions')));
  assert.equal(responses(fx)[0].text.startsWith('Only the Teamtrail owner'), true);
});

test('approvals survive a restart: stored messages are updated in place, and out-of-date buttons are refused', async () => {
  const r = await replayed('slack-approvals-restart.json', approvalRestartFlow);
  const fx = fixture('slack-approvals-restart.json');
  assert.equal(posts(fx, 'chat.postMessage').length, 2, 'the restart posts nothing new');
  const [approve, held] = posts(fx, 'chat.postMessage');
  const updates = posts(fx, 'chat.update');
  assert.deepEqual(
    updates.map((u) => [u.text, u.blocks.some((b: { type: string }) => b.type === 'actions')]),
    [
      ['No longer waiting on you: #2 is done.', false],
      ['Held · #3 Migrate schema', true],
      ['No longer waiting on you: #3 went back to rework.', false],
    ],
  );
  assert.deepEqual(
    updates.map((u) => u.ts),
    [approve, held, held].map((p) => (fx.exchanges.find((e) => e.req.body === p)!.res.body as { ts: string }).ts),
    'each update edits the message posted before the restart',
  );
  assert.deepEqual(
    responses(fx).map((b) => b.text),
    [
      'Nothing changed: this message is out of date. #2 is done.',
      'Nothing changed: this message is out of date. #3 went back to rework.',
    ],
  );
  assert.equal(posts(fx, 'views.open').length, 0, 'a stale Rework… opens no modal');
  assert.deepEqual(
    r.verdicts.map((v) => [v.by, v.verdict]),
    [
      ['claude-02', 'PASS'],
      ['trail lead', 'PASS'],
      ['trail lead', 'FAIL'],
    ],
    'the stale clicks added no verdict',
  );
  assert.deepEqual([r.api.state, r.mig.status], ['closed', 'rework']);
  assert.deepEqual(r.stored, {}, 'nothing left with live buttons');
});

/* ---------- connection, lock, failures ---------- */

function live(o: { hub?: ReturnType<typeof socketHub>; configDir?: string } = {}) {
  const fake = fakeSlack();
  const hub = o.hub ?? socketHub();
  const w = world('record', 'unused.json');
  connected(w);
  return {
    fake,
    hub,
    w,
    make: (extra = {}) =>
      w.service(new MemoryAdapter({ latency: [0, 0] }), {
        fetch: fake.fetch,
        WebSocket: hub.WebSocket,
        ...(o.configDir ? { configDir: o.configDir } : {}),
        ...extra,
      }),
  };
}

test('socket: reconnects on refresh_requested and on a dropped socket; link_disabled stops with an explanation', async () => {
  const { hub, w, make } = live();
  try {
    const svc = make();
    await until(() => svc.status().state === 'online');
    hub.refresh();
    await until(() => hub.connections === 2 && svc.status().state === 'online', 'reconnect after refresh');
    hub.drop();
    await until(() => hub.connections === 3 && svc.status().state === 'online', 'reconnect after drop');
    hub.state.linkDisabled = true;
    hub.drop();
    await until(() => svc.status().state === 'auth-error', 'link disabled');
    assert.match(svc.status().error!, /Socket Mode was turned off/);
    assert.equal(svc.status().enabled, false);
  } finally {
    w.cleanup();
  }
});

test('one Socket Mode connection per machine: a second teamtrail reports where Slack is connected', async () => {
  const { w, make } = live();
  try {
    const a = make();
    await until(() => a.status().state === 'online');
    const b = make({ root: '/other/repo/.teamtrail', lockOwner: 'other' });
    assert.equal(b.status().state, 'elsewhere');
    assert.equal(b.status().heldBy, w.root);
    a.close();
    b.start();
    await until(() => b.status().state === 'online', 'takes over after the first one stops');
  } finally {
    w.cleanup();
  }
});

test('a revoked bot token turns Slack off and asks to reconnect', async () => {
  const { fake, w, make } = live();
  try {
    const svc = make();
    await until(() => svc.status().state === 'online');
    fake.state.installed = false;
    const r = await svc.onEnvelope({
      envelope_id: 'x',
      type: 'events_api',
      payload: { team_id: fake.team.id, api_app_id: fake.app.id, event: { type: 'app_home_opened', user: ANA } },
    });
    await r?.after?.().catch(() => {});
    assert.equal(svc.status().state, 'auth-error');
    assert.equal(svc.status().enabled, false);
  } finally {
    w.cleanup();
  }
});

test('env tokens work like GITHUB_TOKEN: reported by source, never stored', async () => {
  const fake = fakeSlack();
  const hub = socketHub();
  const w = world('record', 'unused.json');
  try {
    const svc = w.service(new MemoryAdapter({ latency: [0, 0] }), {
      fetch: fake.fetch,
      WebSocket: hub.WebSocket,
      env: { TEAMTRAIL_SLACK_APP_TOKEN: TOKENS.app, TEAMTRAIL_SLACK_BOT_TOKEN: TOKENS.bot },
    });
    const s = svc.status();
    assert.deepEqual([s.setup.appToken, s.setup.botToken], ['TEAMTRAIL_SLACK_APP_TOKEN', 'TEAMTRAIL_SLACK_BOT_TOKEN']);
    await until(() => svc.status().state === 'online');
    const on = svc.status();
    assert.deepEqual(
      [on.enabled, on.step, on.setup.appId, on.workspace?.name],
      [true, 5, 'A0Scout0001', 'efika'],
      'verified on first start, then setup continues at the claim',
    );
    const creds = path.join(w.configDir, 'credentials.json');
    assert.ok(
      !existsSync(creds) || !readFileSync(creds, 'utf8').includes('xoxb-'),
      'env tokens are not written to the credential store',
    );
    svc.close();
  } finally {
    w.cleanup();
  }
});

test('a git email alone puts nobody forward; it only tells the trail lead that the account entering the code matches it', async () => {
  const fake = fakeSlack();
  const hub = socketHub();
  const w = world('record', 'unused.json');
  try {
    const svc = w.service(new MemoryAdapter({ latency: [0, 0] }), {
      fetch: fake.fetch,
      WebSocket: hub.WebSocket,
      ownerEmail: () => 'Ana@efika.test\n',
    });
    await svc.pasteToken(TOKENS.app);
    const r = await svc.pasteToken(TOKENS.bot);
    assert.deepEqual([r.ok, r.status.step, r.status.owners, r.status.pendingOwner], [true, 5, [], undefined]);
    await until(() => svc.status().state === 'online');
    const enter = async (user: string) => {
      const { code } = svc.startOwnerCode();
      await hub.envelope(fake.payload.clickHome(user, 'claim_owner'));
      await svc.idle();
      await hub.envelope(fake.payload.submit(user, [...fake.views.keys()].at(-1)!, { code }));
      await svc.idle();
      return svc.status().pendingOwner;
    };
    assert.deepEqual(await enter(RAJ), {
      id: RAJ,
      name: 'raj',
      displayName: 'raj',
      realName: 'Raj Patel',
      via: 'code',
      gitEmail: false,
    });
    svc.resetOwner();
    assert.deepEqual(await enter(ANA), {
      id: ANA,
      name: 'ana',
      displayName: 'ana',
      realName: 'Ana Silva',
      via: 'code',
      gitEmail: true,
    });
    assert.deepEqual(fake.channels.get(fake.im(ANA))?.messages ?? [], [], 'not a word before the confirmation');
    svc.close();
  } finally {
    w.cleanup();
  }
});

test('no email match, or an app without users:read.email, leaves nobody put forward: the code is the way', async () => {
  for (const [email, scopes] of [
    ['nobody@efika.test', ALL_SCOPES],
    ['ana@efika.test', [...BOT_SCOPES]],
  ] as const) {
    const fake = fakeSlack();
    fake.state.scopes = [...scopes];
    const w = world('record', 'unused.json');
    try {
      const svc = w.service(new MemoryAdapter({ latency: [0, 0] }), {
        fetch: fake.fetch,
        WebSocket: socketHub().WebSocket,
        ownerEmail: () => email,
      });
      await svc.pasteToken(TOKENS.app);
      const r = await svc.pasteToken(TOKENS.bot);
      assert.deepEqual([r.ok, r.status.step, r.status.owners, r.status.pendingOwner], [true, 5, [], undefined], email);
      svc.close();
    } finally {
      w.cleanup();
    }
  }
});

/* ---------- routes ---------- */

test('routes: status and token endpoints; cross-site requests are refused; the bridge mounts Slack as a plugin', async () => {
  const fake = fakeSlack();
  const hub = socketHub();
  const w = world('record', 'unused.json');
  const bridge = createTrackerBridge(w.root, {
    plugins: [
      slackPlugin({
        configDir: w.configDir,
        env: {},
        fetch: fake.fetch,
        WebSocket: hub.WebSocket,
        apiUrl: 'https://slack.test/api',
        pollMs: 0,
      }),
    ],
  });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const status = await (await fetch(`${base}/slack`)).json();
    assert.equal(status.step, 1);
    assert.match(status.links.create, /^https:\/\/api\.slack\.com\/apps\?new_app=1&manifest_json=/);
    const bad = await fetch(`${base}/slack/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'hello' }),
    });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).code, 'unknown_token');
    const ok = await fetch(`${base}/slack/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKENS.app }),
    });
    const body = await ok.text();
    assert.equal(ok.status, 200);
    assert.ok(!body.includes(TOKENS.app), 'the token is not echoed back');
    const cross = await fetch(`${base}/slack/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ token: TOKENS.app }),
    });
    assert.equal(cross.status, 403);
    const form = await fetch(`${base}/slack/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ token: TOKENS.app }),
    });
    assert.equal(form.status, 403, 'simple (no-preflight) cross-site posts are refused');
    const removed = await (
      await fetch(`${base}/slack`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
    ).json();
    assert.deepEqual([removed.step, removed.setup.appToken], [1, null]);
  } finally {
    server.close();
    bridge.close();
    w.cleanup();
  }
  assert.equal(typeof slackRoutes, 'function');
});

/* ---------- pure parts ---------- */

test('manifest: Socket Mode, /scout, Save as decision, App Home, the planned scopes and nothing more', () => {
  const m = slackManifest();
  assert.equal(m.settings.socket_mode_enabled, true);
  assert.equal(m.settings.interactivity.is_enabled, true);
  assert.deepEqual(m.settings.event_subscriptions.bot_events, ['app_home_opened']);
  assert.equal(m.features.slash_commands[0].command, '/scout');
  assert.deepEqual(m.features.shortcuts[0], {
    name: 'Save as decision',
    type: 'message',
    callback_id: 'save_decision',
    description: 'Record this thread as a Teamtrail decision',
  });
  assert.equal(m.features.app_home.home_tab_enabled, true);
  assert.deepEqual(m.oauth_config.scopes.bot, [...BOT_SCOPES, 'users:read.email']);
  assert.ok(!('user' in m.oauth_config.scopes));
  const url = new URL(slackLinks.create());
  assert.deepEqual(JSON.parse(url.searchParams.get('manifest_json')!), m);
});

test('tokens are routed by prefix; the app ID comes from the app-level token', () => {
  assert.deepEqual(['xapp-1-A1-1-x', 'xoxb-1', 'xoxp-1', 'xoxe.xoxp-1', 'nope'].map(tokenKind), [
    'app',
    'bot',
    'user',
    'config',
    'unknown',
  ]);
  assert.equal(appIdFromToken('xapp-1-A0123ABCD-4567-deadbeef'), 'A0123ABCD');
  assert.equal(appIdFromToken('xoxb-1'), undefined);
});

test('summary: first, clicked and last two messages, trimmed, markup resolved', () => {
  const m = (ts: string, name: string, text: string) => ({ ts, name, text });
  const msgs = [m('1', 'ana', 'Q?'), m('2', 'raj', 'a'), m('3', 'ana', 'b'), m('4', 'raj', 'c'), m('5', 'ana', 'd')];
  assert.equal(deterministicSummary(msgs, '2'), 'ana: Q?\nraj: a\nraj: c\nana: d');
  assert.equal(deterministicSummary([m('1', 'ana', 'x '.repeat(200))]).length, 'ana: '.length + 220);
  assert.equal(
    plainText('<@U1> see <https://x.y|docs> in <#C1|infra> &amp; more', { U1: 'raj' }),
    '@raj see docs in #infra & more',
  );
});

test('socket acks within the handler and runs slow work after the ack', async () => {
  const hub = socketHub();
  const order: string[] = [];
  const s = new SocketMode({
    open: async () => 'wss://x',
    WebSocket: hub.WebSocket,
    onEnvelope: async () => {
      order.push('handled');
      return { ack: { ok: 1 }, after: async () => void order.push(hub.sent.length ? 'after-acked' : 'after-unacked') };
    },
    onState: () => {},
  });
  s.start();
  await until(() => hub.open === 1);
  const ack = await hub.envelope({ type: 'slash_commands', payload: {} });
  await s.idle();
  assert.deepEqual(ack, { ok: 1 });
  assert.deepEqual(order, ['handled', 'after-acked']);
  s.stop();
});
