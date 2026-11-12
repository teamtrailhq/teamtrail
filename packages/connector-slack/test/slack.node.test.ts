import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryAdapter } from '@teamtrail/core';
import { createTrackerBridge } from '@teamtrail/core/bridge';
import { FIXTURES } from '../../core/test/fixtures';
import { ScoutLink } from '../src/link/scoutLink';
import { slackPlugin, slackRoutes } from '../src/node';
import { deterministicSummary, plainText } from '../src/summary';
import { scoutHub } from './fakes/scoutHub';
import {
  ANA,
  RAJ,
  SCOUT_ENV,
  TOKENS,
  URL_,
  connected,
  freezeTime,
  liveWorld,
  until,
  world,
  type SlackFixture,
} from './harness';
import { approvalFlow, approvalRestartFlow, askFlow, decisionFlow, notifyFlow, statusFlow } from './scenarios';

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
  assert.deepEqual(
    out[3].blocks.at(-1).elements.map((e: { action_id: string }) => e.action_id),
    ['open_teamtrail'],
    'the inbox is a reply only its reader sees: Slack drops clicks there, so it offers no answer buttons, only Open',
  );
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

test('one connection to the Scout service per machine: a second teamtrail reports where Slack is connected', async () => {
  const { w } = liveWorld();
  try {
    connected(w);
    const a = w.service(new MemoryAdapter({ latency: [0, 0] }));
    await until(() => a.status().state === 'online');
    const b = w.service(new MemoryAdapter({ latency: [0, 0] }), { root: '/other/repo/.teamtrail', lockOwner: 'other' });
    assert.equal(b.status().state, 'elsewhere');
    assert.equal(b.status().heldBy, w.root);
    a.close();
    b.start();
    await until(() => b.status().state === 'online', 'takes over after the first one stops');
  } finally {
    w.cleanup();
  }
});

test('Slack refusing the bot token (Scout uninstalled) turns Slack off and asks to add Scout again', async () => {
  const { w, fake } = liveWorld();
  try {
    connected(w);
    const svc = w.service(new MemoryAdapter({ latency: [0, 0] }));
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
    assert.match(svc.status().error!, /Add Scout to Slack again/);
  } finally {
    w.cleanup();
  }
});

/* ---------- routes ---------- */

test('routes: status and connect endpoints; cross-site requests are refused; the bridge mounts Slack as a plugin', async () => {
  const w = world('record', 'unused.json');
  const bridge = createTrackerBridge(w.root, {
    plugins: [
      slackPlugin({
        configDir: w.configDir,
        env: { ...SCOUT_ENV },
        fetch: w.fetch,
        WebSocket: w.hub.WebSocket,
        pollMs: 0,
      }),
    ],
  });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const post = (p: string, headers: Record<string, string> = {}) =>
    fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
  try {
    const status = await (await fetch(`${base}/slack`)).json();
    assert.deepEqual([status.connected, status.state], [false, 'off']);
    const started = await post('/slack/connect/start');
    assert.equal(started.status, 200);
    assert.equal(new URL((await started.json()).url).searchParams.get('return'), `${base}/?settings=slack`);
    assert.equal((await post('/slack/connect/start', { Origin: 'https://evil.example' })).status, 403);
    const form = await fetch(`${base}/slack/connect/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    assert.equal(form.status, 403, 'simple (no-preflight) cross-site posts are refused');
    assert.equal((await post('/slack/connect/finish')).status, 400, 'a code is required');
    const removed = await (
      await fetch(`${base}/slack/connect`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
    ).json();
    assert.deepEqual([removed.connected, removed.state], [false, 'off']);
  } finally {
    server.close();
    bridge.close();
    w.cleanup();
  }
  assert.equal(typeof slackRoutes, 'function');
});

/* ---------- pure parts ---------- */

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

test('the link acks within the handler and runs slow work after the ack', async () => {
  const hub = scoutHub({ fetch, botToken: TOKENS.bot });
  const order: string[] = [];
  const s = new ScoutLink({
    url: 'wss://scout.test/connect',
    token: TOKENS.link,
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

test('a call made while the link is down fails at once as offline, and one in flight when it drops fails too', async () => {
  const hung: typeof fetch = () => new Promise(() => {});
  const hub = scoutHub({ fetch: hung, botToken: TOKENS.bot });
  const s = new ScoutLink({
    url: 'wss://scout.test/connect',
    token: TOKENS.link,
    WebSocket: hub.WebSocket,
    onEnvelope: async () => undefined,
    onState: () => {},
    backoffMs: () => 60_000,
  });
  await assert.rejects(s.call('auth.test'), /offline/);
  s.start();
  await until(() => hub.open === 1);
  const pending = s.call('auth.test');
  hub.drop();
  await assert.rejects(pending, /offline/);
  s.stop();
});
