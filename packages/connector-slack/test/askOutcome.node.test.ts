import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ActivityStream, type AgentSessionDoc } from '@teamtrail/core';
import { AgentDocWriter } from '@teamtrail/core/agents';
import { writeAgentAnswer } from '@teamtrail/core/bridge';
import { answer, closeAsk } from '../src/service/asks';
import type { SlackContext } from '../src/service/slackContext';

const URL_ = 'http://127.0.0.1:7420/';

/** Two asks from one session, and the Slack calls closing them make. */
function cards() {
  const view = (id: string, text: string, at: number) => ({
    agent: 'claude',
    text,
    at,
    sessionId: 's',
    questionId: id,
  });
  const asks: Record<string, unknown> = {
    q1: { sessionId: 's', channel: 'C', ts: '1', view: view('q1', 'Postgres or SQLite?', 1000) },
    q2: { sessionId: 's', channel: 'C', ts: '2', view: view('q2', 'Retention days?', 2000) },
    q3: { sessionId: 's', channel: 'C', ts: '3', view: view('q3', 'Name the table?', 2500) },
  };
  const updates: { ts: string; text: string; blocks: { type: string }[] }[] = [];
  const ctx = {
    o: { root: '/nonexistent', url: () => URL_ },
    asks: { read: () => asks, write: () => {} },
    store: { read: () => ({ notify: { detail: 'full' } }) },
    call: async (_m: string, b: (typeof updates)[number]) => void updates.push(b),
  } as unknown as SlackContext;
  return { ctx, updates };
}

const answered = (id: string, via: 'lookout' | 'chat', chatOf?: string) => ({
  ...{ id, mapId: 'm', sessionId: 's', agent: 'claude', askedAt: 0, answeredAt: 0, via },
  ...(chatOf ? { chatOf } : {}),
});

const doc = {
  v: 1,
  session: { id: 's', status: 'running' },
  pending: [],
  feed: [],
  pid: 1,
  updatedAt: 0,
  // q2 answered in the Lookout first; then q1 passed on from the agent's own chat; q3 withdrawn, after both
  chats: [
    {
      id: 'c1',
      sessionId: 's',
      from: 'human',
      author: 'trail lead',
      text: '90 days',
      at: 3000,
      answers: 'q2',
      via: 'lookout',
    },
    {
      id: 'c2',
      sessionId: 's',
      from: 'human',
      author: 'trail lead',
      text: 'Postgres',
      at: 4000,
      answers: 'q1',
      via: 'chat',
      chatOf: 'claude',
    },
  ],
  answered: [answered('q2', 'lookout'), answered('q1', 'chat', 'claude')],
} as unknown as AgentSessionDoc;

test("each card shows its own question's answer, never a later chat", async () => {
  const { ctx, updates } = cards();
  await closeAsk(ctx, 'q2', [doc]);
  await closeAsk(ctx, 'q3', [doc]);
  assert.deepEqual(
    updates.map((u) => u.text),
    ['✓ Answered in Teamtrail by trail lead: “90 days”.', 'No longer waiting: claude withdrew the question.'],
  );
});

test('an answer passed on in the agent’s chat is guidance, never shown as decided, and keeps the Open link', async () => {
  const { ctx, updates } = cards();
  await closeAsk(ctx, 'q1', [doc]);
  const [u] = updates;
  assert.equal(
    u.text,
    "Answered in claude's chat: “Postgres”. Passed on by the agent as guidance: it decides nothing.",
  );
  assert.doesNotMatch(u.text, /✓|by trail lead/);
  const actions = u.blocks.find((b) => b.type === 'actions') as { elements: { url?: string }[] } | undefined;
  assert.equal(actions?.elements[0].url, URL_);
});

test('an answer kept after the one used is shown as not used, the one used as the answer', async () => {
  const { ctx, updates } = cards();
  const later = {
    id: 'c3',
    sessionId: 's',
    from: 'human',
    author: `slack:U0ANA00001`,
    text: '30 days',
    at: 3100,
    answers: 'q2',
    via: 'slack',
    notUsed: true,
  };
  await closeAsk(ctx, 'q2', [{ ...doc, chats: [...doc.chats, later] } as AgentSessionDoc]);
  assert.deepEqual(
    updates.map((u) => u.text),
    [
      '✓ Answered in Teamtrail by trail lead: “90 days”. Also answered by <@U0ANA00001> via Slack: “30 days”, not used.',
    ],
  );
});

test('Slack answers after the Lookout did: the card shows the Lookout’s answer as the one used, and Slack’s as not used', async () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-slack-first-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  try {
    const activity = new ActivityStream();
    const writer = new AgentDocWriter(root, activity, { pollMs: 10_000 });
    const s = activity.startSession({ id: 's', agent: 'claude', mode: 'work', mapId: 'm' });
    void s.ask('Retention days?');
    writer.flush();
    const q = activity.snapshot.pending[0].id;
    const { ctx, updates } = cards();
    const asks = (ctx.asks.read() as Record<string, unknown>) ?? {};
    asks[q] = { ...(asks.q2 as object), view: { ...(asks.q2 as { view: object }).view, questionId: q } };
    Object.assign(ctx, { o: { ...ctx.o, root }, answering: new Set<string>() });
    writeAgentAnswer(root, { sessionId: 's', questionId: q, text: '90 days', author: 'trail lead', via: 'lookout' });
    assert.equal(await answer(ctx, { s: 's', q }, '30 days', 'U0ANA00001'), 'ok');
    writer.pullAnswers();
    writer.close();
    assert.deepEqual(
      updates.map((u) => u.text),
      [
        '✓ Answered in Teamtrail by trail lead: “90 days”. Also answered by <@U0ANA00001> via Slack: “30 days”, not used.',
      ],
    );
    const chats = activity.snapshot.chats.filter((c) => c.answers === q).map((c) => [c.text, !!c.notUsed]);
    assert.deepEqual(chats, [['90 days', false]], 'the agent got the Lookout’s answer');
  } finally {
    rmSync(path.dirname(root), { recursive: true, force: true });
  }
});
