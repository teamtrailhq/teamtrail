// A question answered in an agent's chat stays open (a chat answer guides, it never passes a gate), but it is the
// human's to answer in their queue only while something still waits on their own answer.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitsOnHuman } from '../src/attention/waitsOnHuman';
import type { PendingQuestion, SessionInfo } from '../src/model/types';

const q = (extra: Partial<PendingQuestion> = {}): PendingQuestion => ({
  id: 'q1',
  sessionId: 's1',
  mapId: 'm',
  ticketId: '2',
  agent: 'claude-01',
  text: 'Comma or semicolon?',
  at: 1,
  ...extra,
});
const guidance = { text: 'Comma', author: 'trail lead', at: 2, chatOf: 'claude-01' };
const session = (waitingOn?: string, status: SessionInfo['status'] = 'running') =>
  ({ id: 's1', status, waitingOn }) as SessionInfo;
const task = { type: 'task' as const };
const junction = { type: 'junction' as const };

test('an unanswered question always waits on the human', () => {
  assert.equal(waitsOnHuman(q(), { ticket: task }), true);
});

test('guided in a chat: settled for the queue unless a gate or the agent waits on their own answer', () => {
  assert.equal(waitsOnHuman(q({ guidance }), { ticket: task, session: session() }), false);
  assert.equal(waitsOnHuman(q({ guidance, lookoutOnly: true }), { ticket: task }), true, 'high risk');
  assert.equal(waitsOnHuman(q({ guidance, stakes: 'Answering this decides #2' }), {}), true, 'decides a ticket');
  assert.equal(waitsOnHuman(q({ guidance }), { ticket: junction }), true, 'asked on a HITL ticket');
  assert.equal(waitsOnHuman(q({ guidance, urgency: 'fyi' }), { ticket: junction }), false, 'an fyi decides nothing');
  assert.equal(waitsOnHuman(q({ guidance }), { ticket: task, session: session('q1') }), true, 'the agent waits');
  assert.equal(waitsOnHuman(q({ guidance }), { session: session('q1', 'done') }), false, 'a session that ended');
});
