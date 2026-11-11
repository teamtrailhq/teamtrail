import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentPaths, MarkdownAdapter } from '@teamtrail/core';
import { readAgentDocs, writeAgentAnswer, writeLocalJson } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signAgentAnswer } from '../../core/src/agents/agentAnswerSignature';
import { agents, type Call } from './fakes/agents';

/*
 * The human answers from an agent's chat with answer_question (`/scout inbox`). Such an answer guides agents: it is
 * delivered to the agent that asked and kept in the transcript. It never stands in for the human at a gate: only
 * an answer given in the Lookout or Slack does, because any local agent can call answer_question, including one
 * that was talked into answering its own question.
 */
let root: string;
const hub = agents(() => root);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-chat-answers-'));
});
afterEach(async () => {
  await hub.closeAll();
  fs.rmSync(root, { recursive: true, force: true });
});

const CHAT = /answered in (claude-0\d)'s chat.*guide agents but can't approve this; answer in the Lookout or Slack/s;
type Asked = { questionId: string };
type Got = { answered: boolean; answer?: string; answeredVia?: string; note?: string };
type Closed = { decision: { id: string; decidedBy: string } };

/** The decision record as kept in the trail. */
async function record(id: string) {
  const adapter = new MarkdownAdapter(nodeMarkdownFs(root), root);
  const [map] = await adapter.listMaps();
  return (await adapter.listDecisions(map.id)).find((d) => d.id === id)!;
}

/** claude-01 holds a junction (the human's to decide) and asks about dropping a table, blocking. */
async function askOnJunction(call: Call) {
  const m = await call<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
    discovery: false,
    title: 'Users',
    destination: 'One users table',
    tickets: [{ ref: 'j', title: 'Keep the users table?', type: 'junction' }],
  });
  await call('claim_ticket', { ticket: m.tickets[0].key });
  const asked = await call<Asked>('ask_human', {
    question: 'Drop the users table?',
    category: 'data-deletion',
    urgency: 'blocking',
    waitSeconds: 0,
  });
  return asked.questionId;
}

/** Every gate an answer could back, tried with this one: each is refused. */
async function everyGateRefuses(call: Call, questionId: string, chatOf: string) {
  const drop = { question: 'Drop the users table?', answer: 'Drop it', category: 'data-deletion' };
  const attempts: [string, Record<string, unknown>][] = [
    // record_decision, high risk, naming the answer
    ['record_decision', { ...drop, questionId }],
    // record_decision, naming the human for a call that isn't high risk
    ['record_decision', { question: 'Keep a backup?', answer: 'Yes', questionId }],
    // closing the HITL ticket on it
    ['close_ticket', { resolution: 'Drop it', questionId }],
    // closing it as a high-risk call on it
    ['close_ticket', { resolution: 'Drop it', category: 'data-deletion', questionId }],
  ];
  for (const [tool, args] of attempts) {
    const refused = call(tool, args);
    await expect(refused).rejects.toThrow(CHAT);
    await expect(refused).rejects.toThrow(new RegExp(`${chatOf}'s chat`));
  }
  // Unnamed, the close never picks a chat answer up: high risk is refused as the agent's own call.
  await expect(call('close_ticket', { resolution: 'Drop it', category: 'data-deletion' })).rejects.toThrow(
    /High-risk call.*in the Lookout or Slack/s,
  );
  await expect(call('record_decision', { ...drop })).rejects.toThrow(/High-risk call/);
}

describe('answers given in an agent’s chat guide agents but never pass a gate', () => {
  it('an agent answering its own question: delivered, shown as chat, refused at every gate', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const questionId = await askOnJunction(call);
    const given = await call<{ delivered: boolean; via: string }>('answer_question', {
      questionId,
      answer: 'Yes, drop it',
    });
    expect(given).toMatchObject({ delivered: true, via: 'chat' });
    const got = await call<Got>('wait_for_answer', { questionId, waitSeconds: 5 });
    expect(got).toMatchObject({ answered: true, answer: 'Yes, drop it', answeredVia: 'chat' });
    expect(got.note).toMatch(/Lookout or Slack/);
    await everyGateRefuses(call, questionId, 'claude-01');
    // The close that is left is the agent's own, with the chat answer in its transcript, marked as such.
    const own = await call<Closed>('close_ticket', { resolution: 'Keep it' });
    expect(own.decision.decidedBy).toBe('claude-01');
    const kept = await record(own.decision.id);
    expect(kept.transcript.find((e) => e.text === 'Yes, drop it')?.author).toBe("trail lead (in claude-01's chat)");
  });

  it('another local agent answering for the human: delivered as chat, refused at every gate', async () => {
    const asker = await hub.connect({ name: 'claude-01' });
    const other = await hub.connect({ name: 'claude-02' });
    const questionId = await askOnJunction(asker);
    await expect(other('answer_question', { questionId, answer: 'Yes, drop it' })).resolves.toMatchObject({
      delivered: true,
      via: 'chat',
    });
    const got = await asker<Got>('wait_for_answer', { questionId, waitSeconds: 5 });
    expect(got).toMatchObject({ answered: true, answer: 'Yes, drop it', answeredVia: 'chat' });
    await everyGateRefuses(asker, questionId, 'claude-02');
  });

  it('the same question answered in the Lookout backs the decision', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const questionId = await askOnJunction(call);
    const doc = (await readAgentDocs(root)).find((d) => d.pending.length)!;
    writeAgentAnswer(root, {
      sessionId: doc.session.id,
      questionId,
      text: 'Yes, drop it',
      author: 'trail lead',
      via: 'lookout',
    });
    const got = await call<Got>('wait_for_answer', { questionId, waitSeconds: 5 });
    expect(got).toMatchObject({ answered: true, answeredVia: 'lookout' });
    expect(got.note).toBeUndefined();
    const closed = await call<Closed>('close_ticket', {
      resolution: 'Drop it',
      category: 'data-deletion',
      questionId,
    });
    expect(closed.decision.decidedBy).toBe('trail lead');
    const kept = await record(closed.decision.id);
    expect(kept).toMatchObject({ decidedBy: 'trail lead', answer: 'Yes, drop it' });
    expect(kept.transcript.find((e) => e.text === 'Yes, drop it')?.author).toBe('trail lead');
  });

  it('an answer from before answers were labelled counts as chat at the gates (fail closed)', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const questionId = await askOnJunction(call);
    const doc = (await readAgentDocs(root)).find((d) => d.pending.length)!;
    const sessionId = doc.session.id;
    // Signed the way every answer was before the label existed: by the Lookout, by Slack, or by answer_question.
    const old = signAgentAnswer(root, { sessionId, questionId, text: 'Yes', author: 'trail lead', at: Date.now() });
    writeLocalJson(root, agentPaths.answer(sessionId, questionId), old);
    const got = await call<Got>('wait_for_answer', { questionId, waitSeconds: 5 });
    expect(got).toMatchObject({ answered: true, answer: 'Yes' });
    await expect(
      call('close_ticket', { resolution: 'Drop it', category: 'data-deletion', questionId }),
    ).rejects.toThrow(/guide agents but can't approve this/);
  });
});
