import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MarkdownAdapter } from '@teamtrail/core';
import { journalPath, readAgentDocs, writeAgentAnswer } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrailAgent, trailNameFamily } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';

let root: string;
const open: { close(): void | Promise<void> }[] = [];

async function connect(agentName?: string, clientName = 'claude-code') {
  let server: ReturnType<typeof createMcpServer> | undefined;
  const agent = new TrailAgent({
    root,
    agent: agentName,
    pollMs: 20,
    client: () => {
      const v = server?.server.getClientVersion();
      return v && `${v.name} ${v.version}`;
    },
  });
  server = createMcpServer(agent, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: clientName, version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => agent.close() }, client);
  const call = async <T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return JSON.parse(r.content[0].text) as T;
  };
  return { agent, client, call };
}

/** Plays the trail lead in the Lookout: answers the next question that shows up in any session doc. */
async function answerNext(text: string, match?: RegExp) {
  for (let i = 0; i < 200; i++) {
    const q = (await readAgentDocs(root)).flatMap((d) => d.pending).find((p) => !match || match.test(p.text));
    if (q)
      return writeAgentAnswer(root, {
        sessionId: q.sessionId,
        questionId: q.id,
        text,
        author: 'trail lead',
        via: 'lookout',
      });
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('no question showed up');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-mcp-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('teamtrail MCP server', () => {
  it('lists the agent tools with instructions', async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'add_ticket',
        'answer_question',
        'ask_human',
        'challenge_assumption',
        'claim_ticket',
        'close_ticket',
        'flag_knowledge',
        'get_brief',
        'list_assumptions',
        'list_inbox',
        'list_guides',
        'next_ticket',
        'projects_status',
        'propose_knowledge',
        'propose_reroute',
        'record_decision',
        'release_ticket',
        'reroute_status',
        'report_completion',
        'report_progress',
        'resume_trail',
        'set_criteria',
        'search_knowledge',
        'start_trail',
        'status',
        'submit_brief',
        'submit_review',
        'update_trail',
        'verification_status',
        'wait_for_answer',
      ].sort(),
    );
    expect(client.getInstructions()).toMatch(/claim_ticket/);
  });

  it('drives a trail end to end: framing, chart, claim, HITL question, close, decisions', async () => {
    const { call } = await connect();

    const framing = call<{ answered: boolean; answer: string; answeredBy: string }>('ask_human', {
      question: 'Who is it for?',
      suggestions: ['Solo devs', 'Teams'],
      framing: true,
    });
    await answerNext('Solo devs first');
    expect(await framing).toMatchObject({ answered: true, answer: 'Solo devs first', answeredBy: 'trail lead' });

    const started = await call<{
      trail: { id: string; key: string };
      tickets: { ref: string; key: string }[];
      next: { key: string };
      framingQuestionsAnswered: number;
    }>('start_trail', {
      discovery: false,
      title: 'Changelog page',
      destination: 'A public changelog page generated from releases',
      decided: ['Static page, no backend'],
      unspecified: ['RSS feed'],
      tickets: [
        { ref: 'src', title: 'Where do release notes live?', type: 'research' },
        { ref: 'look', title: 'Pick the page layout', type: 'junction', blockedBy: ['src'] },
        { ref: 'build', title: 'Build the page', type: 'execute', blockedBy: ['look'] },
      ],
    });
    expect(started.tickets).toHaveLength(3);
    expect(started.framingQuestionsAnswered).toBe(1);
    const key = (ref: string) => started.tickets.find((t) => t.ref === ref)!.key;
    expect(started.next.key).toBe(key('src'));

    const docs = await readAgentDocs(root);
    const chart = docs.find((d) => d.session.mode === 'chart')!;
    expect(chart.session).toMatchObject({ status: 'done', mapId: started.trail.id, agent: 'claude-01' });

    const claimed = await call<{ claimed: { key: string; attention: string; assignee: string } }>('claim_ticket');
    expect(claimed.claimed).toMatchObject({ key: key('src'), attention: 'afk', assignee: 'claude-01' });
    await call('report_progress', {
      step: 'Investigate',
      message: 'reading CHANGELOG.md',
      inputTokens: 1200,
      outputTokens: 300,
      costUsd: 0.0081,
    });
    const closed1 = await call<{ decision: { id: string }; unblocked: { key: string }[] }>('close_ticket', {
      resolution: 'Release notes live in the in-app changelog module. Reuse it.',
      rationale: 'Single source',
      alternatives: ['GitHub releases'],
    });
    expect(closed1.decision.id).toMatch(/^D-\d+$/);
    expect(closed1.unblocked.map((t) => t.key)).toEqual([key('look')]);

    const c2 = await call<{ claimed: { key: string; attention: string; decisionsFromBlockers: { id: string }[] } }>(
      'claim_ticket',
    );
    expect(c2.claimed).toMatchObject({ key: key('look'), attention: 'hitl' });
    expect(c2.claimed.decisionsFromBlockers.map((d) => d.id)).toEqual([closed1.decision.id]);
    const asked = call<{ answered: boolean; answer: string }>('ask_human', {
      question: 'Timeline or grouped by version?',
      suggestions: ['Timeline', 'By version'],
    });
    const pendingDoc = async () => (await readAgentDocs(root)).find((d) => d.pending.length);
    await answerNext('By version');
    expect((await asked).answer).toBe('By version');
    expect(await pendingDoc()).toBeUndefined();
    const closed2 = await call<{ decision: { decidedBy: string }; unblocked: { key: string }[] }>('close_ticket', {
      resolution: 'Group entries by version, newest first.',
      postTranscript: true,
    });
    expect(closed2.decision.decidedBy).toBe('trail lead');
    expect(closed2.unblocked.map((t) => t.key)).toEqual([key('build')]);

    await call('record_decision', {
      question: 'Host it where?',
      answer: 'Same static host as the landing page.',
    });

    const status = await call<{
      trail: {
        progress: string;
        decisions: { summary: string }[];
        ready: { key: string }[];
        spend: { inputTokens: number; costUsd: number };
      };
    }>('status');
    expect(status.trail.progress).toBe('2/3 decided');
    expect(status.trail.ready.map((t) => t.key)).toEqual([key('build')]);
    expect(status.trail.decisions.map((d) => d.summary)).toEqual([
      'Release notes live in the in-app changelog module.',
      // the human's decision is summarised in their own words, not the agent's
      'By version (asked: Timeline or grouped by version?)',
      'Same static host as the landing page.',
    ]);
    expect(status.trail.spend).toMatchObject({ inputTokens: 1200, costUsd: 0.0081 });

    const adapter = new MarkdownAdapter(nodeMarkdownFs(root));
    const snap = await adapter.loadMap(started.trail.id);
    const grill = snap.tickets.find((t) => t.key === key('look'))!;
    expect(grill.state).toBe('closed');
    expect(grill.comments.map((c) => c.body.split('\n')[0])).toEqual(['**HITL transcript**', '**Resolution**']);
    const records = await adapter.listDecisions(started.trail.id);
    expect(records.find((r) => r.ticketId === grill.id)?.transcript.map((e) => e.from)).toEqual(['agent', 'human']);
    // A decision passed when charting is the agent's account, and says so: never read as the human's.
    expect(snap.map.sections.decisions.map((d) => d.text)).toContainEqual(
      expect.stringMatching(/^Static page, no backend \(stated by claude-\d+ when charting\)$/),
    );
  });

  it('returns answered=false when the wait runs out and picks the answer up later', async () => {
    const { call } = await connect();
    await call('start_trail', {
      discovery: false,
      title: 'M',
      destination: 'D',
      tickets: [{ ref: 'a', title: 'Decide', type: 'junction' }],
    });
    await call('claim_ticket');
    const first = await call<{ answered: boolean; questionId: string }>('ask_human', {
      question: 'Now or later?',
      waitSeconds: 0,
    });
    expect(first.answered).toBe(false);
    const inbox = await call<{ questions: { questionId: string; question: string }[] }>('list_inbox');
    expect(inbox.questions.map((q) => q.question)).toEqual(['Now or later?']);
    const waiting = call<{ answered: boolean; answer: string }>('wait_for_answer', {
      questionId: first.questionId,
      waitSeconds: 5,
    });
    await answerNext('Later');
    expect(await waiting).toMatchObject({ answered: true, answer: 'Later' });
  });

  it("answers another agent's question from chat and refuses tickets another agent holds", async () => {
    const one = await connect('claude-01');
    const two = await connect('codex-01', 'codex-mcp-client');
    await one.call('start_trail', {
      discovery: false,
      title: 'Shared',
      destination: 'D',
      tickets: [
        { ref: 'a', title: 'Pick a name', type: 'junction' },
        { ref: 'b', title: 'Survey', type: 'research' },
      ],
    });
    const c = await one.call<{ claimed: { key: string } }>('claim_ticket');
    await expect(two.call('claim_ticket', { ticket: c.claimed.key })).rejects.toThrow(/not on the frontier/);
    await expect(two.call('close_ticket', { ticket: c.claimed.key, resolution: 'x' })).rejects.toThrow(
      /claimed by claude-01/,
    );
    const asked = one.call<{ answer: string }>('ask_human', { question: 'Name?' });
    let qid: string | undefined;
    for (let i = 0; i < 100 && !qid; i++) {
      qid = (await two.call<{ questions: { questionId: string }[] }>('list_inbox')).questions[0]?.questionId;
      if (!qid) await new Promise((r) => setTimeout(r, 20));
    }
    await expect(two.call('answer_question', { questionId: qid, answer: 'Scout' })).resolves.toMatchObject({
      delivered: true,
      to: 'claude-01',
    });
    expect((await asked).answer).toBe('Scout');
    expect(two.agent.defaultWaitSeconds()).toBe(50);
  });

  it('journals every transition the agent makes, with its trailName and session', async () => {
    const { call } = await connect('claude-07');
    const started = await call<{ trail: { id: string } }>('start_trail', {
      discovery: false,
      title: 'Journal',
      destination: 'D',
      tickets: [
        { ref: 'a', title: 'Look', type: 'research' },
        { ref: 'b', title: 'Drop', type: 'task' },
      ],
    });
    const c = await call<{ claimed: { key: string }; session: { id: string } }>('claim_ticket');
    await call('close_ticket', { resolution: 'Found it.' });
    // Ruling #3 out without the human is a proposal, not a transition: nothing is journaled for it.
    const ruled = await call<{ outcome: string }>('close_ticket', {
      ticket: '#3',
      resolution: 'Not needed.',
      outcome: 'out_of_scope',
    });
    expect(ruled.outcome).toBe('proposed');
    const lines = fs
      .readFileSync(journalPath(root, started.trail.id), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines.map((e) => [e.ticketKey, e.event, e.from, e.to, e.actor, e.actorKind])).toEqual([
      [c.claimed.key, 'claim', 'ready', 'working', 'claude-07', 'agent'],
      [c.claimed.key, 'complete', 'working', 'done', 'claude-07', 'agent'],
      [undefined, undefined, undefined, undefined, 'claude-07', 'agent'],
    ]);
    expect(lines[2]).toMatchObject({ kind: 'reroute', action: 'proposed' });
    expect(lines[1].sessionId).toBe(c.session.id);
  });

  it('rejects bad input with clear errors', async () => {
    const { call } = await connect();
    await expect(call('resume_trail')).rejects.toThrow(/No trails yet/);
    await expect(
      call('start_trail', {
        discovery: false,
        title: 'M',
        destination: 'D',
        tickets: [{ ref: 'a', title: 'A', type: 'task', blockedBy: ['zz'] }],
      }),
    ).rejects.toThrow(/unknown ref "zz"/);
    await call('start_trail', { discovery: false, title: 'Plan', destination: 'D', mode: 'plan-only' });
    await expect(call('add_ticket', { title: 'Do it', type: 'execute' })).rejects.toThrow(/plan-only/);
    await expect(call('report_progress', { step: 'Fly' })).rejects.toThrow(/step must be/);
    await expect(call('claim_ticket')).rejects.toThrow(/No ready ticket|closed/);
  });
});

describe('trailNameFamily', () => {
  it('maps client names to trailName prefixes', () => {
    expect(trailNameFamily('claude-code 2.1.0')).toBe('claude');
    expect(trailNameFamily('codex-mcp-client 0.50')).toBe('codex');
    expect(trailNameFamily('Cursor 1.0')).toBe('cursor');
    expect(trailNameFamily('my-agent')).toBe('my');
    expect(trailNameFamily(undefined)).toBe('agent');
  });
});
