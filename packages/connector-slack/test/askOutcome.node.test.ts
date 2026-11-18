import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentSessionDoc } from '@teamtrail/core';
import { closeAsk } from '../src/service/asks';
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
