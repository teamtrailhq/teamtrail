import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentPaths, MarkdownAdapter } from '@teamtrail/core';
import {
  LookoutOnlyAnswer,
  lookoutOnlyTickets,
  readAgentDocs,
  ticketNeedsLookout,
  writeAgentAnswer,
  writeLocalJson,
} from '@teamtrail/core/agents';
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
const HITL = /is the human's to decide: it closes only after they answer.*in the Lookout or Slack.*ask_human/s;
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
  // Unnamed, the close never picks a chat answer up: the junction stays the human's to decide.
  await expect(call('close_ticket', { resolution: 'Drop it', category: 'data-deletion' })).rejects.toThrow(HITL);
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
    // Nor does it close as the agent's own call: a junction is the human's to decide.
    await expect(call('close_ticket', { resolution: 'Keep it' })).rejects.toThrow(HITL);
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

  it('a Slack answer backs an ordinary call but never a high-risk one: those need the Lookout', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const questionId = await askOnJunction(call);
    const doc = (await readAgentDocs(root)).find((d) => d.pending.length)!;
    // asked with a high-risk category: core takes no Slack answer to it at all
    expect(() =>
      writeAgentAnswer(root, {
        sessionId: doc.session.id,
        questionId,
        text: 'Drop it',
        author: 'slack:U0ANA',
        via: 'slack',
      }),
    ).toThrow(LookoutOnlyAnswer);

    const medium = await call<Asked>('ask_human', {
      question: 'Show deleted users greyed out?',
      category: 'product-behaviour',
      urgency: 'blocking',
      waitSeconds: 0,
    });
    const asked = (await readAgentDocs(root)).find((d) => d.pending.some((q) => q.id === medium.questionId))!;
    writeAgentAnswer(root, {
      sessionId: asked.session.id,
      questionId: medium.questionId,
      text: 'Greyed out',
      author: 'slack:U0ANA',
      via: 'slack',
    });
    const got = await call<Got>('wait_for_answer', { questionId: medium.questionId, waitSeconds: 5 });
    expect(got).toMatchObject({ answered: true, answeredVia: 'slack' });
    const lookout = /answered in Slack, and this decision is high risk: only an answer given in the Lookout counts/;
    // the decision is high risk by its category: refused
    await expect(
      call('record_decision', {
        question: 'Drop?',
        answer: 'Greyed out',
        category: 'data-deletion',
        questionId: medium.questionId,
      }),
    ).rejects.toThrow(lookout);
    // the policy now makes the question's own category high: a Slack answer to it backs nothing either
    fs.writeFileSync(
      path.join(root, 'policy.json'),
      JSON.stringify({ v: 1, categories: { 'product-behaviour': 'high' }, paths: [] }),
    );
    await expect(
      call('record_decision', { question: 'Greyed?', answer: 'Greyed out', questionId: medium.questionId }),
    ).rejects.toThrow(lookout);
    fs.rmSync(path.join(root, 'policy.json'));
    const closed = await call<Closed>('close_ticket', {
      resolution: 'Greyed out',
      category: 'product-behaviour',
      questionId: medium.questionId,
    });
    expect(closed.decision.decidedBy).toBe('slack:U0ANA');
  });

  it('a Lookout answer from someone not allowed high-risk calls backs an ordinary call, never a high-risk one', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const questionId = await askOnJunction(call);
    const doc = (await readAgentDocs(root)).find((d) => d.pending.length)!;
    const limited = { author: 'trail lead', via: 'lookout-limited' as const };
    expect(() =>
      writeAgentAnswer(root, { sessionId: doc.session.id, questionId, text: 'Drop it', ...limited }),
    ).toThrow(/high risk: ask someone allowed to make high-risk calls/);

    const medium = await call<Asked>('ask_human', {
      question: 'Show deleted users greyed out?',
      category: 'product-behaviour',
      urgency: 'blocking',
      waitSeconds: 0,
    });
    const asked = (await readAgentDocs(root)).find((d) => d.pending.some((q) => q.id === medium.questionId))!;
    writeAgentAnswer(root, {
      sessionId: asked.session.id,
      questionId: medium.questionId,
      text: 'Greyed out',
      ...limited,
    });
    const got = await call<Got>('wait_for_answer', { questionId: medium.questionId, waitSeconds: 5 });
    expect(got).toMatchObject({ answered: true, answeredVia: 'lookout-limited' });
    expect(got.note).toBeUndefined();
    await expect(
      call('record_decision', {
        question: 'Drop?',
        answer: 'Greyed out',
        category: 'data-deletion',
        questionId: medium.questionId,
      }),
    ).rejects.toThrow(/answered in the Lookout by someone not allowed to make high-risk calls/);
    const closed = await call<Closed>('close_ticket', {
      resolution: 'Greyed out',
      category: 'product-behaviour',
      questionId: medium.questionId,
    });
    expect(closed.decision.decidedBy).toBe('trail lead');
  });

  it('a high-risk question marks its ticket for good, where the repo can’t reach; an ordinary one doesn’t', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    await askOnJunction(call);
    const [map] = await new MarkdownAdapter(nodeMarkdownFs(root), root).listMaps();
    const { tickets } = await new MarkdownAdapter(nodeMarkdownFs(root), root).loadMap(map.id);
    expect(lookoutOnlyTickets.has(root, map.id, tickets[0].id)).toBe(true);
    // the session docs go (a month on, or deleted by an agent): the mark still holds
    fs.rmSync(path.join(root, '.agents', 'sessions'), { recursive: true, force: true });
    expect(await ticketNeedsLookout(root, map.id, tickets[0].id)).toBe(true);
    const plain = await call<{ trail: { id: string }; tickets: { id: string; key: string }[] }>('start_trail', {
      discovery: false,
      title: 'Copy',
      destination: 'Button copy',
      tickets: [{ ref: 'c', title: 'Which label?', type: 'junction' }],
    });
    expect(lookoutOnlyTickets.has(root, plain.trail.id, plain.tickets[0].id)).toBe(false);
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

/** The human answers the question waiting, in the Lookout (the bridge's path). */
async function answerInLookout(questionId: string, text: string) {
  const doc = (await readAgentDocs(root)).find((d) => d.pending.some((q) => q.id === questionId))!;
  writeAgentAnswer(root, { sessionId: doc.session.id, questionId, text, author: 'trail lead', via: 'lookout' });
}

/** claude-01 holds a fresh ticket of this kind. */
async function holding(call: Call, ticket: Record<string, unknown>) {
  const m = await call<{ tickets: { key: string }[] }>('start_trail', {
    discovery: false,
    title: 'Layout',
    destination: 'One layout',
    tickets: [{ ref: 't', title: 'The ticket', ...ticket }],
  });
  await call('claim_ticket', { ticket: m.tickets[0].key });
  return m.tickets[0].key;
}

describe('a ticket that needs the human closes only on their answer in the Lookout or Slack (local agents too)', () => {
  for (const kind of [{ type: 'junction' }, { type: 'prototype' }, { type: 'task', hitl: true }])
    it(`${kind.type}${kind.hitl ? ' (hitl)' : ''}: no answer → refused, with how to get one`, async () => {
      const call = await hub.connect({ name: 'claude-01' });
      await holding(call, kind);
      await expect(call('close_ticket', { resolution: 'Grouped by version' })).rejects.toThrow(HITL);
      await expect(call('report_completion', { resolution: 'Grouped by version' })).rejects.toThrow(HITL);
    });

  it('a chat answer → refused; an fyi answer in the Lookout → refused; a Lookout answer on that ticket → closes', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    await holding(call, { type: 'junction' });
    const chat = await call<Asked>('ask_human', { question: 'Timeline or by version?', waitSeconds: 0 });
    await call('answer_question', { questionId: chat.questionId, answer: 'By version' });
    await call('wait_for_answer', { questionId: chat.questionId, waitSeconds: 5 });
    await expect(call('close_ticket', { resolution: 'By version' })).rejects.toThrow(HITL);
    await expect(call('close_ticket', { resolution: 'By version', questionId: chat.questionId })).rejects.toThrow(CHAT);

    const fyi = await call<Asked>('ask_human', { question: 'By version, OK?', urgency: 'fyi', waitSeconds: 0 });
    await answerInLookout(fyi.questionId, 'Yes');
    await call('wait_for_answer', { questionId: fyi.questionId, waitSeconds: 5 });
    await expect(call('close_ticket', { resolution: 'By version' })).rejects.toThrow(HITL);
    await expect(call('close_ticket', { resolution: 'By version', questionId: fyi.questionId })).rejects.toThrow(
      /asked as an fyi/,
    );

    const asked = await call<Asked>('ask_human', { question: 'Timeline or by version?', waitSeconds: 0 });
    await answerInLookout(asked.questionId, 'By version, newest first');
    await call('wait_for_answer', { questionId: asked.questionId, waitSeconds: 5 });
    const closed = await call<Closed>('close_ticket', { resolution: 'By version, newest first' });
    expect(closed.decision.decidedBy).toBe('trail lead');
  });

  it('an answer to a question asked on another ticket doesn’t close this one', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    const m = await call<{ tickets: { key: string }[] }>('start_trail', {
      discovery: false,
      title: 'Two',
      destination: 'Two calls',
      tickets: [
        { ref: 'a', title: 'First call', type: 'junction' },
        { ref: 'b', title: 'Second call', type: 'junction' },
      ],
    });
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const asked = await call<Asked>('ask_human', { question: 'First?', waitSeconds: 0 });
    await answerInLookout(asked.questionId, 'Yes');
    await call('wait_for_answer', { questionId: asked.questionId, waitSeconds: 5 });
    await call('release_ticket', { ticket: m.tickets[0].key });
    await call('claim_ticket', { ticket: m.tickets[1].key });
    await expect(call('close_ticket', { resolution: 'Yes' })).rejects.toThrow(HITL);
  });

  it('a ticket that doesn’t need the human closes as before, as the agent’s own call', async () => {
    const call = await hub.connect({ name: 'claude-01' });
    await holding(call, { type: 'research' });
    const closed = await call<Closed>('close_ticket', { resolution: 'Notes live in RELEASES' });
    expect(closed.decision.decidedBy).toBe('claude-01');
  });
});
