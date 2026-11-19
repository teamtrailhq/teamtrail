import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ActivityStream } from '../src/activity/activityStream';
import { writeAgentAnswer } from '../src/agents/agentDocs';
import { AgentDocWriter } from '../src/agents/agentDocWriter';
import { agentPaths, type AgentSessionDoc, type WrittenAnswer } from '../src/agents/agentLink';
import { chatNote, type AnswerVia } from '../src/model/answerVia';

/*
 * Two answers to one question given at once (the Lookout and Slack, two people) each get a file of their own: the
 * first in line that verifies is the answer, the later one is kept as not used, and every process agrees which is
 * which. A file planted by anything that can't sign blocks nothing.
 */

// Forked below as a writer: answers its question at the given moment and prints what writeAgentAnswer returned.
if (process.env.ANSWER_WRITER) {
  const { root, sessionId, questionId, text, via, startAt } = JSON.parse(process.env.ANSWER_WRITER);
  while (Date.now() < startAt) {
    /* everyone starts writing at the same moment */
  }
  const written = writeAgentAnswer(root, { sessionId, questionId, text, author: `by-${text}`, via });
  process.send!(written, () => process.exit(0));
}

const roots: string[] = [];
const tmpRoot = () => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-answers-'));
  roots.push(base);
  const root = path.join(base, '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
// A forked writer runs none of the tests.
const it: typeof test = process.env.ANSWER_WRITER ? ((() => {}) as unknown as typeof test) : test;
if (!process.env.ANSWER_WRITER) test.after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function asking(root: string, questions = 1) {
  const activity = new ActivityStream();
  const kept: string[] = [];
  const writer = new AgentDocWriter(root, activity, {
    pollMs: 10,
    onNotUsed: (_q, answers) => kept.push(...answers.map((a) => a.text)),
  });
  const s = activity.startSession({ id: 's_1', agent: 'claude-01', mode: 'work', mapId: 'm1' });
  const got = new Map<string, string>();
  for (let i = 0; i < questions; i++) {
    void s.ask(`Question ${i}?`).then((a) => got.set(`Question ${i}?`, a));
  }
  writer.flush();
  return { activity, writer, qs: activity.snapshot.pending.map((p) => p.id), got, kept };
}

/** A writer in its own process; resolves with what writeAgentAnswer returned there. */
function answerFromProcess(env: { root: string; questionId: string; text: string; via: AnswerVia; startAt: number }) {
  const child = fork(fileURLToPath(import.meta.url), [], {
    env: { ...process.env, ANSWER_WRITER: JSON.stringify({ ...env, sessionId: 's_1' }) },
    execArgv: [],
  });
  return new Promise<WrittenAnswer>((resolve, reject) => {
    child.once('message', (m) => resolve(m as WrittenAnswer));
    child.once('error', reject);
    child.once('exit', (code) => code && reject(new Error(`writer exited with ${code}`)));
  });
}

it('two answers from two processes at once: one is first for everyone, the other is kept as not used', async () => {
  const root = tmpRoot();
  const a = asking(root, 4);
  const startAt = Date.now() + 400;
  const runs = a.qs.map((questionId) =>
    Promise.all([
      answerFromProcess({ root, questionId, text: `lookout-${questionId}`, via: 'lookout', startAt }),
      answerFromProcess({ root, questionId, text: `slack-${questionId}`, via: 'slack', startAt }),
    ]),
  );
  const results = await Promise.all(runs);
  await wait(150);
  a.writer.close();
  for (const [i, pair] of results.entries()) {
    const q = a.qs[i];
    const used = pair.filter((w) => !w.firstAnswer);
    const later = pair.filter((w) => w.firstAnswer);
    assert.equal(used.length, 1, 'exactly one writer is told its answer is the one used');
    assert.equal(later[0].firstAnswer!.text, used[0].text, 'the other is told which answer came first');
    assert.equal(a.got.get(`Question ${i}?`), used[0].text, 'the asking agent gets the one the writers agree on');
    const chats = a.activity.snapshot.chats.filter((c) => c.answers === q);
    assert.deepEqual(
      chats.map((c) => [c.text, c.notUsed ?? false]),
      [
        [used[0].text, false],
        [later[0].text, true],
      ],
      'both are in the conversation, the later one marked not used',
    );
    assert.equal(chatNote(chats[1]), 'also answered, not used');
  }
  assert.equal(a.kept.length, 4, 'the asking agent hears of every answer it did not use');
});

it('a file planted before the human answers takes no place in line and blocks nothing', async () => {
  const root = tmpRoot();
  const a = asking(root);
  const q = a.qs[0];
  const dir = path.join(root, agentPaths.answerDir('s_1', q));
  mkdirSync(dir, { recursive: true });
  const planted = {
    sessionId: 's_1',
    questionId: q,
    text: 'Yes, drop it',
    author: 'trail lead',
    at: 1,
    via: 'lookout',
  };
  writeFileSync(path.join(dir, '1.json'), JSON.stringify(planted));
  writeFileSync(path.join(dir, '2.json'), JSON.stringify({ ...planted, sig: 'f'.repeat(64) }));
  // and the single file older versions read, also planted
  writeFileSync(path.join(root, agentPaths.answer('s_1', q)), JSON.stringify(planted));
  const written = writeAgentAnswer(root, { sessionId: 's_1', questionId: q, text: 'No', author: 'x', via: 'lookout' });
  assert.equal(written.firstAnswer, undefined, 'the human is told their answer is the one used');
  assert.ok(existsSync(path.join(dir, '3.json')), 'it took the next free number');
  await wait(80);
  a.writer.close();
  assert.equal(a.got.get('Question 0?'), 'No');
  const flags = a.activity.snapshot.feed.filter((f) => /was not written by/.test(f.text));
  assert.equal(flags.length, 3, 'each planted file is flagged once');
  assert.ok(a.activity.snapshot.chats.every((c) => c.text !== 'Yes, drop it'));
});

it('something put where the question folder goes is cleared, never in the way of the answer', async () => {
  const root = tmpRoot();
  const a = asking(root);
  const q = a.qs[0];
  const dir = path.join(root, agentPaths.answerDir('s_1', q));
  mkdirSync(path.dirname(dir), { recursive: true });
  writeFileSync(dir, 'not a folder');
  writeAgentAnswer(root, { sessionId: 's_1', questionId: q, text: 'Go', author: 'x', via: 'slack' });
  await wait(80);
  a.writer.close();
  assert.equal(a.got.get('Question 0?'), 'Go');
});

it('an answer that comes in after the one delivered is kept as not used, never delivered', async () => {
  const root = tmpRoot();
  const a = asking(root);
  const q = a.qs[0];
  writeAgentAnswer(root, { sessionId: 's_1', questionId: q, text: 'Postgres', author: 'trail lead', via: 'lookout' });
  await wait(60);
  // written by a writer that read the session doc before the question left it
  const late = { sessionId: 's_1', questionId: q, text: 'SQLite', author: 'slack:U1' };
  const doc = path.join(root, agentPaths.session('s_1'));
  const before = JSON.parse(readFileSync(doc, 'utf8')) as AgentSessionDoc;
  writeFileSync(doc, JSON.stringify({ ...before, pending: [{ id: q, sessionId: 's_1' }] }));
  const written = writeAgentAnswer(root, { ...late, via: 'slack' });
  assert.equal(written.firstAnswer?.text, 'Postgres');
  await wait(60);
  a.writer.close();
  assert.equal(a.got.get('Question 0?'), 'Postgres');
  const kept = a.activity.snapshot.chats.find((c) => c.text === 'SQLite');
  assert.equal(kept?.notUsed, true);
  assert.equal(kept?.via, 'slack');
  assert.deepEqual(a.kept, ['SQLite']);
});

it('an asking process from before numbered answers is given the single file it reads', () => {
  const root = tmpRoot();
  const a = asking(root);
  a.writer.close();
  const q = a.qs[0];
  const doc = path.join(root, agentPaths.session('s_1'));
  const { answerFormat, ...older } = JSON.parse(readFileSync(doc, 'utf8')) as AgentSessionDoc;
  assert.equal(answerFormat, 2);
  writeFileSync(doc, JSON.stringify(older));
  writeAgentAnswer(root, { sessionId: 's_1', questionId: q, text: 'Yes', author: 'x', via: 'lookout' });
  assert.ok(existsSync(path.join(root, agentPaths.answer('s_1', q))));
  assert.equal(existsSync(path.join(root, agentPaths.answerDir('s_1', q))), false);
});

it('the answer folder of a question is cleared a while after it was answered', async () => {
  const root = tmpRoot();
  const a = asking(root);
  const q = a.qs[0];
  writeAgentAnswer(root, { sessionId: 's_1', questionId: q, text: 'Yes', author: 'x', via: 'lookout' });
  await wait(60);
  const dir = path.join(root, agentPaths.answerDir('s_1', q));
  assert.deepEqual(readdirSync(dir), ['1.json']);
  const now = Date.now;
  Date.now = () => now() + 61_000;
  try {
    a.writer.pullAnswers();
  } finally {
    Date.now = now;
  }
  a.writer.close();
  assert.equal(existsSync(dir), false);
});
