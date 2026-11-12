/**
 * Injection in Slack text. Agents and the tracker supply trail and ticket titles, agent names, questions,
 * suggestions and reasons. None of it may notify a channel, mention someone, or show a link under another label:
 * `<`, `>` and `&` are escaped in every text Slack parses, mrkdwn is `verbatim`, and every message is posted with
 * parsing and name-linking off.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryAdapter, chartMap, claim, type ApprovalItem, type MapSnapshot } from '@teamtrail/core';
import {
  approvalClosedMessage,
  approvalMessage,
  askClosedMessage,
  askMessage,
  decisionModal,
  escape,
  helpText,
  homeView,
  mention,
  noticeModal,
  replyModal,
  reworkModal,
} from '../src/blocks';
import { notesOf, trailChanges } from '../src/service/trailChanges';
import { briefTrail, statusBlocks, trailListBlocks } from '../src/status';
import { ANA, agentDoc, connected, freezeTime, liveWorld, readJson, until } from './harness';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

/** Everything the audit named, in one string an agent could put anywhere. */
const EVIL =
  '<!channel> <!here> <!everyone> <!subteam^S0123|team> <@U0EVE0001> <#C0INFRA01> <https://evil.example|click here> @here & ```';
/** The only `<…>` sequences Scout writes itself: a mention of a real user id, and Slack's own permalink. */
const OURS = [/<@U0ANA0001>/g, /<https:\/\/efika\.slack\.com\/archives\/[^|>]+\|thread>/g];

/** Fails when a text Slack parses still holds a control sequence, or a mrkdwn object isn't verbatim. */
function assertInert(value: unknown, where: string) {
  const check = (text: string, at: string) => {
    const rest = OURS.reduce((t, ours) => t.replace(ours, ''), text);
    assert.doesNotMatch(rest, /</, `${where} ${at}: an unescaped "<" in ${JSON.stringify(text.slice(0, 160))}`);
    assert.doesNotMatch(rest.replace(/&(amp|lt|gt);/g, ''), /&/, `${where} ${at}: an unescaped "&"`);
  };
  const walk = (v: unknown, at: string, top: boolean) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}[${i}]`, false));
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.type === 'mrkdwn') {
      assert.equal(o.verbatim, true, `${where} ${at}: mrkdwn must be verbatim`);
      check(String(o.text), at);
    }
    if (top && typeof o.text === 'string') check(o.text, `${at}.text`);
    for (const [k, x] of Object.entries(o)) walk(x, `${at}.${k}`, false);
  };
  walk(value, '$', true);
}

test('assertInert catches what it is meant to catch', () => {
  assert.throws(() => assertInert({ text: 'hi <!channel>' }, 'x'), /unescaped "<"/);
  assert.throws(() => assertInert({ blocks: [{ text: { type: 'mrkdwn', text: 'ok' } }] }, 'x'), /verbatim/);
  assert.throws(() =>
    assertInert({ blocks: [{ text: { type: 'mrkdwn', verbatim: true, text: '<@U0EVE0001>' } }] }, 'x'),
  );
  assertInert({ text: escape(EVIL), blocks: [{ text: { type: 'mrkdwn', verbatim: true, text: `<@${ANA}>` } }] }, 'x');
});

test('escape and mention: no control sequence survives; a mention is only ever a real user id', () => {
  assert.equal(escape('<!channel> & <@U1>'), '&lt;!channel&gt; &amp; &lt;@U1&gt;');
  assert.equal(mention(ANA), `<@${ANA}>`);
  for (const bad of ['!channel', '!here', 'U1|x> <!channel', 'U0ANA0001> <!here', 'u0ana0001', ''])
    assert.doesNotMatch(mention(bad), /<[@!]/, bad);
});

const item = (kind: ApprovalItem['kind']): ApprovalItem =>
  ({ kind, mapId: 'm1', ticketId: 't1', ticketKey: EVIL, title: EVIL, reason: EVIL, attemptId: 'A-1' }) as ApprovalItem;

test('every message, modal and Home builder: hostile text in every field comes out inert', () => {
  const ask = {
    sessionId: 's',
    questionId: 'q',
    text: EVIL,
    suggestions: [EVIL, EVIL],
    agent: EVIL,
    trail: EVIL,
    ticket: EVIL,
    stakes: EVIL,
  };
  const built: Record<string, unknown> = {
    askMessage: askMessage(ask, { url: 'http://localhost:7420/' }),
    askTitlesOnly: askMessage(ask, { detail: 'titles-only' }),
    askClosed: askClosedMessage(
      ask,
      `✓ Answered by ${mention(ANA)} via Slack: “${escape(EVIL)}”. ${escape(EVIL)} resumed.`,
    ),
    replyModal: replyModal(ask, '{}'),
    approve: approvalMessage(EVIL, item('approve'), 'http://localhost:7420/'),
    held: approvalMessage(EVIL, item('held')),
    highRisk: approvalMessage(EVIL, item('approve'), 'http://localhost:7420/', 'lookout'),
    askLookout: askMessage(ask, { url: 'http://localhost:7420/', mode: 'lookout' }),
    askRead: askMessage(ask, { url: 'http://localhost:7420/', mode: 'read' }),
    approvalClosed: approvalClosedMessage(EVIL, item('approve'), `✓ Approved by ${mention(ANA)} via Slack.`),
    reworkModal: reworkModal(`${EVIL} ${EVIL}`, '{}'),
    notice: noticeModal('{}', `Couldn't read the thread (${escape(EVIL)}).`),
    decision: decisionModal(
      {
        trails: [{ id: 'm1', label: EVIL }],
        mapId: 'm1',
        tickets: [{ id: 't1', label: EVIL }],
        ticketId: 't1',
        mode: 'resolve',
        decision: EVIL,
        summary: EVIL,
        thread: {
          channel: EVIL,
          count: 3,
          participants: [EVIL, 'here', 'channel'],
          permalink: 'https://efika.slack.com/archives/C0INFRA01/p1',
        },
        postsTo: EVIL,
      },
      '{}',
    ),
    homeIdle: homeView({ kind: 'idle' }, { command: '/scout' }),
    homeYours: homeView({ kind: 'yours', owner: ANA }, { command: '/scout', url: 'http://localhost:7420/' }),
    homeOther: homeView({ kind: 'connected', owner: '!channel' }, { command: '/scout' }),
    help: { text: helpText('/scout') },
  };
  for (const [name, message] of Object.entries(built)) assertInert(message, name);
  // Buttons and menu options are plain_text, which Slack never parses; they must not be mrkdwn.
  type Blocks = { blocks: { type: string; elements?: { text: { type: string } }[] }[] };
  const labels = (built.askMessage as Blocks).blocks.find((b) => b.type === 'actions')!.elements!;
  assert.ok(labels.every((e) => e.text.type === 'plain_text'));
});

/** A trail where every name an agent or the tracker controls is hostile. */
async function hostileTrail() {
  const a = new MemoryAdapter({ latency: [0, 0], label: EVIL, location: EVIL });
  const { map, tickets } = await chartMap(a, {
    title: `Store ${EVIL}`,
    sections: { destination: EVIL, notes: '', decisions: [], unspecified: [], outOfScope: [] },
    tickets: [
      { ref: 'db', title: `Pick DB ${EVIL}`, type: 'junction', body: EVIL },
      { ref: 'mig', title: `Migrate ${EVIL}`, type: 'execute', body: EVIL, blockedBy: ['db'] },
      { ref: 'bench', title: `Bench ${EVIL}`, type: 'research', body: EVIL },
    ],
  });
  await claim(a, map.id, tickets[0].id, { assignee: EVIL });
  return { a, map, db: tickets[0], mig: tickets[1], bench: tickets[2] };
}

test('trip report and trail notifications: hostile titles, keys and agent names, in and out of the code block', async () => {
  const { a, map, db } = await hostileTrail();
  const snap = await a.loadMap(map.id);
  const hostile: MapSnapshot = { ...snap, tickets: snap.tickets.map((t) => ({ ...t, key: `${t.key}${EVIL}` })) };
  const docs = [
    {
      session: { id: 's', mapId: map.id, agent: EVIL, status: 'running', usage: undefined },
      pending: [{ id: 'q', ticketId: undefined, agent: EVIL, text: EVIL, at: Date.now() }],
    },
  ] as never;
  const brief = briefTrail(hostile, docs);
  assert.ok(brief.frontier.length && brief.blocked.length && brief.awaiting.length && brief.sessions.length);
  const status = statusBlocks(brief, { now: Date.now(), url: 'http://localhost:7420/' });
  assertInert(status, 'statusBlocks');
  assert.equal((status.blocks[0].text!.text.match(/```/g) ?? []).length, 2, 'a title cannot end the code block');
  assertInert(trailListBlocks([brief], '/scout'), 'trailListBlocks');

  const prev = notesOf({ ...hostile, tickets: hostile.tickets.map((t) => ({ ...t, blockedBy: [] })) });
  const closed = {
    ...hostile,
    tickets: hostile.tickets.map((t) =>
      t.id === db.id ? { ...t, state: 'closed' as const, closeReason: 'completed' as const } : t,
    ),
  };
  const events = new Set(['blocked', 'resolved', 'trail.done']);
  const done = { ...closed, tickets: closed.tickets.map((t) => ({ ...t, state: 'closed' as const })) };
  const lines = [
    ...trailChanges({ snap: hostile, docs, prev, now: notesOf(hostile), events }),
    ...trailChanges({ snap: closed, docs, prev: notesOf(hostile), now: notesOf(closed), events }),
    ...trailChanges({ snap: done, docs, prev: notesOf(hostile), now: notesOf(done), events }),
  ];
  assert.ok(lines.some((l) => l.includes('BLOCKED')) && lines.some((l) => l.includes('RESOLVED')));
  assert.ok(lines.some((l) => l.includes('TRAIL DONE')));
  assertInert({ text: lines.join('\n') }, 'trail notifications');
});

test('end to end: nothing Scout posts, updates, opens, publishes or replies carries a live mention or link', async () => {
  const l = liveWorld();
  const { w, calls, replies, lastView } = l;
  try {
    const { a, map, db, bench } = await hostileTrail();
    connected(w, {
      notify: { target: 'C0INFRA01', events: ['awaiting', 'blocked', 'resolved', 'trail.done'], detail: 'full' },
    });
    const svc = w.service(a);
    await until(() => svc.status().state === 'online');
    await svc.tick(); // baseline
    agentDoc(w.root, {
      sid: 's1',
      mapId: map.id,
      ticketId: db.id,
      agent: EVIL,
      pending: [{ id: 'q1', ticketId: db.id, text: EVIL, suggestions: [EVIL], at: Date.now() }],
    });
    agentDoc(w.root, { sid: 's2', mapId: map.id, agent: EVIL, pending: [{ id: 'q2', text: EVIL, at: Date.now() }] });
    await a.addBlocking(map.id, bench.id, db.id);
    await svc.tick();
    const ask = readJson(path.join(w.root, '.agents', 'slack.json')).asks.q1 as { channel: string; ts: string };
    for (const text of ['status', `status ${map.key}`, 'status <!channel>', 'inbox', '<!here>', 'help']) {
      const ack = await w.send(svc, `/scout ${text}`, (f) => f.payload.command(ANA, 'C0INFRA01', text));
      if (ack) assertInert(ack, `the ack of /scout ${text}`);
    }
    await w.send(svc, 'ana presses Reply…', (f) => f.payload.click(ANA, ask.channel, ask.ts, 'ask_reply'));
    await w.send(svc, 'ana answers with hostile text', (f) => f.payload.submit(ANA, lastView(), { answer: EVIL }));
    await w.send(svc, 'ana runs /scout decide', (f) => f.payload.command(ANA, 'C0INFRA01', `decide ${EVIL}`));
    await w.send(svc, 'ana saves it resolving the hostile ticket', (f) => f.payload.submit(ANA, lastView()));
    agentDoc(w.root, { sid: 's2', mapId: map.id, agent: EVIL, status: 'done' });
    await svc.tick();
    await w.send(svc, 'ana opens Home', (f) => f.payload.homeOpened(ANA));

    const sent = [...calls('chat.postMessage'), ...calls('chat.update')];
    assert.ok(calls('chat.postMessage').length >= 3 && calls('chat.update').length >= 2, 'asks, digest and closings');
    for (const m of sent) {
      assert.deepEqual(
        [m.parse, m.link_names, m.unfurl_links, m.unfurl_media],
        ['none', false, false, false],
        `parsing is off for ${JSON.stringify(m.text).slice(0, 60)}`,
      );
      assertInert(m, 'message');
    }
    assert.equal(replies().length, 5, 'three trip reports, the inbox and the saved decision');
    for (const r of replies()) {
      assertInert(r, 'response_url');
      assert.deepEqual([r.parse, r.link_names, r.unfurl_links, r.unfurl_media], ['none', false, false, false]);
    }
    for (const v of [...calls('views.open'), ...calls('views.update'), ...calls('views.publish')])
      assertInert(v.view, 'view');
    assert.ok(
      sent.some((m) => String(m.text).includes('&lt;!channel&gt;')),
      'the hostile text is shown, as text',
    );
  } finally {
    w.cleanup();
  }
});
