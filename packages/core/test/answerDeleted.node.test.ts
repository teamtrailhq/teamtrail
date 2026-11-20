import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ActivityStream } from '../src/activity/activityStream';
import { writeAgentAnswer } from '../src/agents/agentDocs';
import { AgentDocWriter } from '../src/agents/agentDocWriter';
import { agentPaths } from '../src/agents/agentLink';
import type { AnswerVia } from '../src/model/answerVia';

/*
 * Answer files sit in the repo, where an agent with write access can delete them. It can't write one (each is signed
 * with this machine's key), but deleting one could promote the answer after it: another person's, given after the
 * human was told theirs came first. A deletion fails closed: nothing in line after the deleted answer counts, the
 * question stays open, and an answer given after the deletion is the one used.
 */
const roots: string[] = [];
test.after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function asking() {
  const base = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-answer-deleted-'));
  roots.push(base);
  const root = path.join(base, '.teamtrail');
  mkdirSync(root, { recursive: true });
  const activity = new ActivityStream();
  // never polls by itself: each test says when the asking process looks
  const writer = new AgentDocWriter(root, activity, { pollMs: 3_600_000 });
  const s = activity.startSession({ id: 's_1', agent: 'claude-01', mode: 'work', mapId: 'm1' });
  const got: { text?: string } = {};
  void s.ask('Keep the users table?').then((t) => (got.text = t));
  writer.flush();
  const questionId = activity.snapshot.pending[0].id;
  const answer = (text: string, via: AnswerVia, author = 'trail lead') =>
    writeAgentAnswer(root, { sessionId: 's_1', questionId, text, author, via });
  const file = (n: number) => path.join(root, agentPaths.answerDir('s_1', questionId), `${n}.json`);
  const look = async () => {
    writer.pullAnswers();
    await new Promise((r) => setTimeout(r, 10));
  };
  const open = () => activity.snapshot.pending.some((q) => q.id === questionId);
  const used = () => activity.snapshot.answered.find((a) => a.id === questionId);
  return { writer, answer, file, look, open, used, got };
}

test('the first answer deleted: the one after it never counts in its place, and answering again does', async () => {
  const a = asking();
  a.answer('Keep it', 'lookout');
  const second = a.answer('Drop it', 'slack', 'slack:U0ANA');
  assert.equal(second.firstAnswer?.text, 'Keep it', 'whoever gave the second answer is told the first is used');
  rmSync(a.file(1));
  await a.look();
  assert.equal(a.open(), true, 'the question is open again');
  assert.equal(a.got.text, undefined, 'nothing counts as answered');
  assert.equal(a.used(), undefined);
  a.answer('Keep it', 'lookout');
  await a.look();
  assert.equal(a.got.text, 'Keep it');
  assert.equal(a.used()?.via, 'lookout');
  a.writer.close();
});

test('the first answer replaced by a copy of the second: nothing counts', async () => {
  const a = asking();
  a.answer('Keep it', 'lookout');
  a.answer('Drop it', 'slack', 'slack:U0ANA');
  rmSync(a.file(1));
  copyFileSync(a.file(2), a.file(1));
  await a.look();
  assert.equal(a.open(), true);
  assert.equal(a.got.text, undefined);
  a.writer.close();
});

test('the only answer deleted: the question stays open, nobody decided, and the next answer is used', async () => {
  const a = asking();
  a.answer('Keep it', 'lookout');
  rmSync(a.file(1));
  await a.look();
  assert.equal(a.open(), true);
  assert.equal(a.used(), undefined);
  a.answer('Drop it', 'lookout');
  await a.look();
  assert.equal(a.got.text, 'Drop it');
  a.writer.close();
});

test('an answer deleted after it was used changes nothing: the asking process already holds it', async () => {
  const a = asking();
  a.answer('Keep it', 'lookout');
  await a.look();
  assert.equal(a.got.text, 'Keep it');
  rmSync(a.file(1));
  await a.look();
  assert.equal(a.used()?.via, 'lookout');
  assert.equal(a.open(), false);
  a.writer.close();
});
