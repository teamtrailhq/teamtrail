import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter } from '@teamtrail/core';
import { readAgentDocs, writeAgentAnswer } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';

let root: string;
const open: { close(): void | Promise<void> }[] = [];

async function connect() {
  const agent = new TrailAgent({ root, agent: 'claude-01', pollMs: 20 });
  const server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  return async <T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
}

type Decision = {
  decision: {
    id: string;
    decidedBy: string;
    question: string;
    answer: string;
    rationale: string;
    transcript: { from: string; text: string }[];
    risk?: { level: string; category?: string; reason: string };
  };
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-policy-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

async function trail(call: Awaited<ReturnType<typeof connect>>) {
  await call('start_trail', {
    discovery: false,
    title: 'Reminders',
    destination: 'Clients get reminders',
    tickets: [{ ref: 'build', title: 'Build the scheduler', type: 'task' }],
  });
}

describe('risk policy over MCP', () => {
  it('an answer to one question does not make another decision the human’s (local agents too)', async () => {
    const call = await connect();
    const m = await call<{ tickets: { key: string }[] }>('start_trail', {
      discovery: false,
      title: 'Style',
      destination: 'One style',
      tickets: [
        { ref: 'j', title: 'Tabs or spaces?', type: 'junction' },
        { ref: 'k', title: 'Keep the users table?', type: 'junction' },
      ],
    });
    const say = async (text: string) => {
      let doc = (await readAgentDocs(root)).find((d) => d.pending.length);
      while (!doc) {
        await new Promise((r) => setTimeout(r, 20));
        doc = (await readAgentDocs(root)).find((d) => d.pending.length);
      }
      writeAgentAnswer(root, { sessionId: doc.session.id, questionId: doc.pending[0].id, text, author: 'trail lead' });
    };
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const asked = call<{ questionId: string }>('ask_human', { question: 'Tabs or spaces?', waitSeconds: 30 });
    await say('tabs');
    const { questionId } = await asked;
    // The reviewer's sequence: "tabs" spent on dropping a table. High risk, and the answer never carried it.
    const drop = { resolution: 'Drop the users table', category: 'data-deletion' };
    await expect(call('close_ticket', drop)).rejects.toThrow(/High-risk call \(data-deletion is high risk\)/);
    await expect(call('close_ticket', { ...drop, questionId })).rejects.toThrow(/asked without a category/);
    const closed = await call<{ decision: { decidedBy: string } }>('close_ticket', { resolution: 'Tabs' });
    expect(closed.decision.decidedBy).toBe('trail lead');
    // Used up, and not about the other ticket anyway: the next close is the agent's own, so high risk is refused.
    await call('claim_ticket', { ticket: m.tickets[1].key });
    await expect(call('close_ticket', drop)).rejects.toThrow(/High-risk call/);
    await expect(call('close_ticket', { ...drop, questionId })).rejects.toThrow(/already backs the close of/);
    for (let i = 0; i < 3; i++)
      await expect(
        call('record_decision', { question: 'Drop?', answer: 'Drop it', category: 'data-deletion', questionId }),
      ).rejects.toThrow(/already backs/);
    const own = await call<{ decision: { decidedBy: string } }>('close_ticket', { resolution: 'Keep it' });
    expect(own.decision.decidedBy).toBe('claude-01');
  });

  /** Asks, and answers as the trail lead would in the Lookout. */
  const askAndAnswer = async (
    call: Awaited<ReturnType<typeof connect>>,
    args: Record<string, unknown>,
    text: string,
  ) => {
    const asked = call<{ questionId: string }>('ask_human', { waitSeconds: 30, ...args });
    let doc = (await readAgentDocs(root)).find((d) => d.pending.length);
    while (!doc) {
      await new Promise((r) => setTimeout(r, 20));
      doc = (await readAgentDocs(root)).find((d) => d.pending.length);
    }
    writeAgentAnswer(root, { sessionId: doc.session.id, questionId: doc.pending[0].id, text, author: 'trail lead' });
    const { questionId } = await asked;
    while ((await readAgentDocs(root)).some((d) => d.pending.length)) await new Promise((r) => setTimeout(r, 20));
    return questionId;
  };
  const junctions = (call: Awaited<ReturnType<typeof connect>>) =>
    call<{ trail: { id: string }; tickets: { key: string }[] }>('start_trail', {
      discovery: false,
      title: 'Style',
      destination: 'One style',
      tickets: [
        { ref: 'j', title: 'Tabs or spaces?', type: 'junction' },
        { ref: 'k', title: 'Keep the users table?', type: 'junction' },
      ],
    });

  it('an answer covers the risk of what it is used for, when the risk comes from the files too', async () => {
    const call = await connect();
    const m = await junctions(call);
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const tabs = await askAndAnswer(call, { question: 'Tabs or spaces?' }, 'tabs');
    const decision = { question: 'Drop it?', answer: 'Drop the users table' };
    const migration = { paths: ['db/migrations/001_drop_users.sql'] };
    // No category declared: the policy still calls it high risk by its path, and "tabs" was not about that.
    await expect(call('record_decision', { ...decision, ...migration, questionId: tabs })).rejects.toThrow(
      /asked without a category, and this decision is (high risk|"schema")/,
    );
    await expect(
      call('close_ticket', { resolution: 'Drop the users table', ...migration, questionId: tabs }),
    ).rejects.toThrow(/asked without a category/);
    // Refused calls give the answer back: it still closes what it was about.
    const closed = await call<{ decision: { decidedBy: string } }>('close_ticket', {
      resolution: 'Tabs',
      questionId: tabs,
    });
    expect(closed.decision.decidedBy).toBe('trail lead');
  });

  it("a declared category never stands in for the high risk the files carry (the review's reproduction)", async () => {
    const call = await connect();
    const m = await junctions(call);
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const lodash = await askAndAnswer(call, { question: 'Bump lodash?', category: 'dependencies' }, 'Yes');
    const migration = { category: 'dependencies', paths: ['db/migrations/001.sql'] };
    // "Bump lodash?" was about dependencies; the files make this a high-risk schema call.
    await expect(
      call('record_decision', { question: 'Bump lodash?', answer: 'Yes', ...migration, questionId: lodash }),
    ).rejects.toThrow(/"schema"/);
    // Still free for what it was asked about.
    const own = await call<Decision>('record_decision', {
      question: 'Bump lodash?',
      answer: 'Yes',
      category: 'dependencies',
      questionId: lodash,
    });
    expect(own.decision.decidedBy).toBe('trail lead');
  });

  it('a high-risk path rule without a category is not carried by an answer asked with any category', async () => {
    fs.writeFileSync(
      path.join(root, 'policy.json'),
      JSON.stringify({ v: 1, paths: [{ glob: 'infra/**', level: 'high' }] }),
    );
    const call = await connect();
    const m = await junctions(call);
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const style = await askAndAnswer(call, { question: 'Rename the button?', category: 'product-behaviour' }, 'Yes');
    await expect(
      call('record_decision', { question: 'Rename?', answer: 'Yes', paths: ['infra/prod.tf'], questionId: style }),
    ).rejects.toThrow(/high risk by its files.*category/);
    // A decision that names the category it was asked with is that question's, high risk or not.
    await expect(
      call('record_decision', {
        question: 'Rename?',
        answer: 'Yes',
        category: 'product-behaviour',
        paths: ['infra/prod.tf'],
        questionId: style,
      }),
    ).resolves.toBeTruthy();
  });

  it("two high-risk categories at once can't be carried by one answer", async () => {
    const call = await connect();
    const m = await junctions(call);
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const billing = await askAndAnswer(call, { question: 'Change the invoice?', category: 'billing' }, 'Yes');
    await expect(
      call('record_decision', {
        question: 'Change?',
        answer: 'Yes',
        category: 'billing',
        paths: ['db/migrations/002.sql'],
        questionId: billing,
      }),
    ).rejects.toThrow(/"schema"/);
    // Asked about both, the answer covers both: it backs the decision.
    const both = await askAndAnswer(
      call,
      { question: 'Change the invoice and its table?', categories: ['billing', 'schema'] },
      'Yes',
    );
    const d = await call<Decision>('record_decision', {
      question: 'Change?',
      answer: 'Yes',
      category: 'billing',
      paths: ['db/migrations/002.sql'],
      questionId: both,
    });
    expect(d.decision.decidedBy).toBe('trail lead');
    // `category` and `categories` together are one list.
    const mixed = await askAndAnswer(
      call,
      { question: 'Both again?', category: 'schema', categories: ['billing'] },
      'Yes',
    );
    await expect(
      call('record_decision', {
        question: 'Again?',
        answer: 'Yes',
        category: 'billing',
        paths: ['db/migrations/3.sql'],
        questionId: mixed,
      }),
    ).resolves.toBeTruthy();
  });

  it('a close that fails after the ticket is resolved has still used the answer', async () => {
    const call = await connect();
    const m = await junctions(call);
    const trailId = fs.readdirSync(root).find((n) => fs.existsSync(path.join(root, n, 'map.md')))!;
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const tabs = await askAndAnswer(call, { question: 'Tabs or spaces?' }, 'tabs');
    // The ticket closes, then recording the decision fails: its folder can't be written.
    const decisions = path.join(root, trailId, 'decisions');
    fs.rmSync(decisions, { recursive: true, force: true });
    fs.writeFileSync(decisions, 'not a folder');
    await expect(call('close_ticket', { resolution: 'Tabs', questionId: tabs })).rejects.toThrow();
    fs.rmSync(decisions);
    // The human answered once; that answer has gone into a close and can't back another decision.
    await expect(
      call('record_decision', { question: 'Tabs or spaces?', answer: 'tabs', questionId: tabs }),
    ).rejects.toThrow(/already backs/);
  });

  it('an fyi question is not a decision: it cannot close a ticket that is the human’s to decide', async () => {
    const call = await connect();
    const m = await junctions(call);
    await call('claim_ticket', { ticket: m.tickets[1].key });
    const lunch = await askAndAnswer(call, { question: 'Lunch?', urgency: 'fyi' }, 'yes');
    await expect(call('close_ticket', { resolution: 'Drop the users table', questionId: lunch })).rejects.toThrow(
      /asked as an fyi/,
    );
    // Unnamed, it is not picked up either: the close is the agent's own (a local agent may; remote may not).
    const own = await call<{ decision: { decidedBy: string } }>('close_ticket', { resolution: 'Keep it' });
    expect(own.decision.decidedBy).toBe('claude-01');
  });

  it('one answer backs one decision, also when two calls race for it; decisions made at once all get an id', async () => {
    const call = await connect();
    const m = await junctions(call);
    await call('claim_ticket', { ticket: m.tickets[0].key });
    const questionId = await askAndAnswer(call, { question: 'Tabs or spaces?' }, 'tabs');
    const settled = await Promise.allSettled([
      call('close_ticket', { resolution: 'Tabs', questionId }),
      call('record_decision', { question: 'Indent?', answer: 'Tabs', questionId }),
      call('record_decision', { question: 'Indent again?', answer: 'Tabs', questionId }),
    ]);
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of settled.filter((x) => x.status === 'rejected'))
      expect(String((r as PromiseRejectedResult).reason)).toMatch(/already backs/);

    const before = (
      await new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root).listDecisions(m.trail.id)
    ).length;
    const made = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => call<Decision>('record_decision', { question: `Q${n}?`, answer: `A${n}` })),
    );
    expect(new Set(made.map((d) => d.decision.id)).size).toBe(5);
    const after = await new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root).listDecisions(
      m.trail.id,
    );
    expect(after.length).toBe(before + 5);
    expect(after.map((d) => d.answer)).toEqual(expect.arrayContaining(['A1', 'A2', 'A3', 'A4', 'A5']));
  });

  it('rejects agent decisions on high-risk calls and tells the agent to ask', async () => {
    const call = await connect();
    await trail(call);
    const base = { question: 'Which table?', answer: 'A new reminders table' };
    await expect(call('record_decision', { ...base, category: 'schema' })).rejects.toThrow(
      /High-risk call \(schema is high risk\).*ask_human with category "schema"/,
    );
    await expect(call('record_decision', { ...base, paths: ['db/migrations/0004_reminders.sql'] })).rejects.toThrow(
      /matches \*\*\/migrations\/\*\*/,
    );
    // Naming the human in an argument is not the human deciding: nobody answered anything, so it is refused.
    for (const decidedBy of ['trail lead', 'slack:U123', 'operator', 'claude-02'])
      await expect(call('record_decision', { ...base, category: 'schema', decidedBy })).rejects.toThrow(
        /pass questionId/,
      );

    // The human answers the agent's question in the Lookout: the decision is theirs by that answer, named by id.
    const answered = async (question: string, extra: Record<string, unknown> = {}) => {
      const asked = call<{ questionId: string }>('ask_human', { question, waitSeconds: 30, ...extra });
      let doc = (await readAgentDocs(root)).find((d) => d.pending.length);
      while (!doc) {
        await new Promise((r) => setTimeout(r, 20));
        doc = (await readAgentDocs(root)).find((d) => d.pending.length);
      }
      writeAgentAnswer(root, {
        sessionId: doc.session.id,
        questionId: doc.pending[0].id,
        text: 'Yes',
        author: 'trail lead',
      });
      return (await asked).questionId;
    };
    // An answer to something else is not an answer to this: asked without the category, it can't carry it.
    const other = await answered('Tabs for indentation?');
    await expect(call('record_decision', { ...base, category: 'schema', questionId: other })).rejects.toThrow(
      /asked without a category, and this decision is "schema"/,
    );
    await expect(call('record_decision', { ...base, questionId: 'q_made_up' })).rejects.toThrow(/No answer on record/);

    const questionId = await answered('A new table for reminders?', { category: 'schema' });
    const human = await call<Decision>('record_decision', { ...base, category: 'schema', questionId });
    expect(human.decision).toMatchObject({
      decidedBy: 'trail lead',
      // the question as asked and their words, not the agent's wording of either
      question: 'A new table for reminders?',
      answer: 'Yes',
      rationale: "claude-01's reading: A new reminders table",
      risk: { level: 'high', category: 'schema' },
    });
    expect(human.decision.transcript.map((e) => `${e.from}: ${e.text}`)).toContain('human: Yes');
    // One answer, one decision.
    await expect(call('record_decision', { ...base, category: 'schema', questionId })).rejects.toThrow(
      /already backs D-\d+: one answer, one decision/,
    );
  });

  it('records medium and low calls with their level, and leaves calls without a category alone', async () => {
    const call = await connect();
    await trail(call);
    const medium = await call<Decision>('record_decision', {
      question: 'Which date library?',
      answer: 'date-fns',
      category: 'dependencies',
    });
    expect(medium.decision.risk).toEqual({
      level: 'medium',
      category: 'dependencies',
      reason: 'dependencies is medium risk',
    });
    const plain = await call<Decision>('record_decision', { question: 'Name?', answer: 'ReminderJob' });
    expect(plain.decision.risk).toBeUndefined();
  });

  it('follows the project policy file, and closing a high-risk ticket alone is rejected', async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'policy.json'), JSON.stringify({ v: 1, categories: { dependencies: 'high' } }));
    const call = await connect();
    await trail(call);
    const { claimed } = await call<{ claimed: { key: string } }>('claim_ticket');
    await expect(
      call('close_ticket', { resolution: 'Added date-fns and built it', category: 'dependencies' }),
    ).rejects.toThrow(/dependencies is high risk/);
    const closed = await call<{ closed: string }>('close_ticket', { resolution: 'Built it with what we have' });
    expect(closed.closed).toBe(claimed.key);
  });

  it('puts the category on the question', async () => {
    const call = await connect();
    await trail(call);
    await call('ask_human', { question: 'Drop the old table?', category: 'data-deletion', waitSeconds: 0 });
    const inbox = await call<{ questions: { question: string; category?: string }[] }>('list_inbox');
    expect(inbox.questions.find((q) => q.question === 'Drop the old table?')?.category).toBe('data-deletion');
  });
});
