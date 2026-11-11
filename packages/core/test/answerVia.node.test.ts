import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ActivityStream } from '../src/activity/activityStream';
import { signAgentAnswer } from '../src/agents/agentAnswerSignature';
import { writeAgentAnswer } from '../src/agents/agentDocs';
import { AgentDocWriter } from '../src/agents/agentDocWriter';
import { agentPaths, type AgentSessionDoc } from '../src/agents/agentLink';
import { answeredTickets } from '../src/attention/answeredTickets';
import { approvesGates } from '../src/model/answerVia';

/*
 * How an answer was given (the Lookout, Slack, or an agent's chat through answer_question) is signed with it, so a
 * chat answer can't be relabelled into one that approves gates.
 */
const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-via-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function asking(root: string) {
  const activity = new ActivityStream();
  const writer = new AgentDocWriter(root, activity, { pollMs: 10 });
  const s = activity.startSession({ id: 's_1', agent: 'claude-01', mode: 'work', mapId: 'm1' });
  let answered: string | undefined;
  void s.ask('Drop the users table?').then((a) => (answered = a));
  writer.flush();
  const q = activity.snapshot.pending[0];
  return { activity, writer, q, answered: () => answered };
}

test('only answers given in the Lookout or Slack approve gates; unlabelled (older) ones count as chat', () => {
  assert.equal(approvesGates('lookout'), true);
  assert.equal(approvesGates('slack'), true);
  assert.equal(approvesGates('chat'), false);
  assert.equal(approvesGates(undefined), false);
});

test('a chat answer is delivered, labelled chat and with the agent whose chat it was', async () => {
  const root = tmpRoot();
  const a = asking(root);
  writeAgentAnswer(root, {
    sessionId: 's_1',
    questionId: a.q.id,
    text: 'Yes',
    author: 'trail lead',
    via: 'chat',
    chatOf: 'claude-02',
  });
  await wait(80);
  a.writer.close();
  assert.equal(a.answered(), 'Yes', 'the asking agent gets it');
  assert.deepEqual(
    { via: a.activity.snapshot.answered[0].via, chatOf: a.activity.snapshot.answered[0].chatOf },
    { via: 'chat', chatOf: 'claude-02' },
  );
  assert.equal(a.activity.snapshot.chats.at(-1)?.via, 'chat');
});

test('a chat answer relabelled as the Lookout’s is not delivered', async () => {
  const root = tmpRoot();
  const a = asking(root);
  const file = path.join(root, agentPaths.answer('s_1', a.q.id));
  const signed = signAgentAnswer(root, {
    sessionId: 's_1',
    questionId: a.q.id,
    text: 'Yes',
    author: 'trail lead',
    at: Date.now(),
    via: 'chat',
    chatOf: 'claude-01',
  });
  mkdirSync(path.dirname(file), { recursive: true });
  // the attack: the agent rewrites the label on its own chat answer
  writeFileSync(file, JSON.stringify({ ...signed, via: 'lookout', chatOf: undefined }));
  await wait(80);
  a.writer.close();
  assert.equal(a.answered(), undefined, 'the relabelled answer was not delivered');
  assert.equal(existsSync(file), false);
  assert.equal(a.activity.snapshot.pending.length, 1, 'the question still waits for the human');
});

test('a label added to an older, unlabelled answer does not verify either', async () => {
  const root = tmpRoot();
  const a = asking(root);
  const file = path.join(root, agentPaths.answer('s_1', a.q.id));
  const old = signAgentAnswer(root, { sessionId: 's_1', questionId: a.q.id, text: 'Yes', author: 'x', at: 1 });
  assert.equal('via' in old, false, 'signed the way answers were before labels');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...old, via: 'slack' }));
  await wait(80);
  a.writer.close();
  assert.equal(a.answered(), undefined);
});

test('an older, unlabelled answer is still delivered, and carries no label (so gates read it as chat)', async () => {
  const root = tmpRoot();
  const a = asking(root);
  const file = path.join(root, agentPaths.answer('s_1', a.q.id));
  const old = signAgentAnswer(root, { sessionId: 's_1', questionId: a.q.id, text: 'Yes', author: 'trail lead', at: 1 });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(old));
  await wait(80);
  a.writer.close();
  assert.equal(a.answered(), 'Yes');
  assert.equal(a.activity.snapshot.answered[0].via, undefined);
  assert.equal(approvesGates(a.activity.snapshot.answered[0].via), false);
});

test('writeAgentAnswer signs the label it is given by its caller', () => {
  const root = tmpRoot();
  const a = asking(root);
  const ans = writeAgentAnswer(root, { sessionId: 's_1', questionId: a.q.id, text: 'Yes', author: 'x', via: 'slack' });
  a.writer.close();
  const file = JSON.parse(readFileSync(path.join(root, agentPaths.answer('s_1', a.q.id)), 'utf8'));
  assert.equal(file.via, 'slack');
  assert.equal(ans.via, 'slack');
});

test('a risky-files flag is cleared only by an answer given in the Lookout or Slack, not in a chat', () => {
  const answered = (via?: 'lookout' | 'slack' | 'chat') => ({
    id: `q-${via}`,
    mapId: 'm1',
    sessionId: 's_1',
    agent: 'claude-01',
    askedAt: 1,
    answeredAt: 2,
    ticketId: via ?? 'none',
    category: 'schema' as const,
    ...(via ? { via } : {}),
  });
  const doc = {
    session: { mapId: 'm1' },
    answered: [answered('lookout'), answered('slack'), answered('chat'), answered()],
  } as unknown as AgentSessionDoc;
  assert.deepEqual(
    answeredTickets([doc]).map((c) => c.ticketId),
    ['lookout', 'slack'],
  );
});
