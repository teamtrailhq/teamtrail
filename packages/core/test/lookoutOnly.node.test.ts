/**
 * High-risk calls take the human's word from the Lookout only, in core, for every path. A Slack answer, click or
 * submission reaches this machine through Teamtrail's Scout service, which could be made to forge one, so whatever
 * Slack's blocks show, these refuse it: resolving or recording a decision on a high-risk ticket, answering a
 * high-risk question, approving a reroute or a setting request, and approving work that touched high-risk files.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { LookoutOnlyAnswer, writeAgentAnswer } from '../src/agents/agentDocs';
import { agentPaths, type AgentSessionDoc } from '../src/agents/agentLink';
import { journalFile } from '../src/history/journalFile';
import { writeLocalJson } from '../src/lib/ensureLocalDir';
import type { RiskCategory } from '../src/model/risk';
import { chartMap } from '../src/planning/operations/chart';
import { recordDecision } from '../src/planning/operations/decisionOps';
import { resolve } from '../src/planning/operations/resolve';
import { approveReroute, rejectReroute } from '../src/planning/reroute/decideReroute';
import { proposeReroute } from '../src/planning/reroute/rerouteFlow';
import { needsLookout } from '../src/policy/needsLookout';
import { ticketNeedsLookout } from '../src/policy/ticketNeedsLookout';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const slack = { kind: 'slack' as const, ref: 'C1/1.000' };

async function trail() {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-lookout-only-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  const adapter = new MemoryAdapter({ latency: [0, 0] });
  const { map, tickets } = await chartMap(adapter, {
    title: 'Users',
    sections: SECTIONS,
    tickets: [
      { ref: 'drop', title: 'Drop the old table?', type: 'junction', body: '' },
      { ref: 'copy', title: 'Button copy', type: 'junction', body: '' },
    ],
  });
  return { root, adapter, mapId: map.id, risky: tickets[0], plain: tickets[1] };
}

/** An agent waiting on a question about a ticket, asked with this category. */
function asked(root: string, o: { mapId: string; ticketId: string; category?: RiskCategory }) {
  const doc: AgentSessionDoc = {
    v: 1,
    session: {
      id: 's1',
      agent: 'claude-01',
      mode: 'work',
      mapId: o.mapId,
      ticketId: o.ticketId,
      step: 1,
      total: 1,
      stepLabel: 'Ask',
      status: 'running',
      startedAt: Date.now(),
    },
    chats: [],
    pending: [
      {
        id: 'q1',
        sessionId: 's1',
        mapId: o.mapId,
        ticketId: o.ticketId,
        agent: 'claude-01',
        text: 'Drop it?',
        at: Date.now(),
        ...(o.category ? { category: o.category } : {}),
      },
    ],
    answered: [],
    feed: [],
    pid: process.pid,
    updatedAt: Date.now(),
  } as AgentSessionDoc;
  writeLocalJson(root, agentPaths.session('s1'), doc);
}

test('resolve and recordDecision: a Slack decision on a high-risk ticket is refused, and fails closed unchecked', async () => {
  const t = await trail();
  asked(t.root, { mapId: t.mapId, ticketId: t.risky.id, category: 'schema' });
  assert.equal(await ticketNeedsLookout(t.root, t.mapId, t.risky.id), true);
  assert.equal(await ticketNeedsLookout(t.root, t.mapId, t.plain.id), false);
  const highRisk = (m: string, id: string) => ticketNeedsLookout(t.root, m, id);
  const fromSlack = { answer: 'Drop it', author: 'slack:U1', decision: { source: slack } };
  await assert.rejects(
    resolve(t.adapter, t.mapId, t.risky.id, { ...fromSlack, guard: { via: 'slack', highRisk } }),
    new RegExp(`${t.risky.key} is high risk: decide it in the Lookout`),
  );
  await assert.rejects(
    resolve(t.adapter, t.mapId, t.plain.id, fromSlack),
    new RegExp(`Can't tell whether ${t.plain.key} is high risk`),
    'a Slack-sourced decision with no check fails closed',
  );
  await assert.rejects(
    recordDecision(
      t.adapter,
      t.mapId,
      {
        ticketId: t.risky.id,
        ticketKey: t.risky.key,
        question: 'Q',
        answer: 'A',
        summary: 'A',
        decidedBy: 'slack:U1',
        source: slack,
      },
      { guard: { highRisk } },
    ),
    /high risk/,
  );
  assert.equal((await t.adapter.loadMap(t.mapId)).tickets.find((x) => x.id === t.risky.id)!.state, 'open');
  assert.deepEqual(await t.adapter.listDecisions(t.mapId), []);
  // The ordinary ticket from Slack, the risky one from the Lookout, and a decision about the whole trail: fine.
  await resolve(t.adapter, t.mapId, t.plain.id, { ...fromSlack, guard: { via: 'slack', highRisk } });
  await resolve(t.adapter, t.mapId, t.risky.id, { answer: 'Drop it', author: 'trail lead', guard: { via: 'lookout' } });
  await recordDecision(t.adapter, t.mapId, {
    question: 'Q',
    answer: 'A',
    summary: 'A',
    decidedBy: 'slack:U1',
    source: { ...slack, ref: 'C1/2.000' },
  });
  assert.equal((await t.adapter.listDecisions(t.mapId)).length, 3);
});

test('writeAgentAnswer: a Slack answer to a high-risk question is refused; the Lookout and chat are not', async () => {
  const t = await trail();
  asked(t.root, { mapId: t.mapId, ticketId: t.risky.id, category: 'schema' });
  const answer = (via: 'slack' | 'lookout' | 'chat') =>
    writeAgentAnswer(t.root, { sessionId: 's1', questionId: 'q1', text: 'Drop it', author: 'x', via });
  assert.throws(() => answer('slack'), LookoutOnlyAnswer);
  assert.equal(answer('lookout').via, 'lookout');
  asked(t.root, { mapId: t.mapId, ticketId: t.plain.id, category: 'product-behaviour' });
  assert.equal(answer('slack').via, 'slack', 'a medium-risk question takes a Slack answer');
});

test('approving a reroute or a setting request from Slack is refused in core; declining is not', async () => {
  const t = await trail();
  const env = { root: t.root, adapter: t.adapter, journal: journalFile(t.root) };
  const propose = (mode: 'plan-only' | 'plan+execute') =>
    proposeReroute(env, {
      mapId: t.mapId,
      kind: 'reroute',
      lane: 'setting',
      reason: `Switch to ${mode}`,
      evidence: 'why',
      invalidates: [],
      changes: [{ op: 'set_mode', mode }],
      by: `claude-0${mode.length}`,
    });
  const r = await propose('plan-only');
  const id = r.proposal.id;
  await assert.rejects(approveReroute(env, { mapId: t.mapId, id, by: 'slack:U1' }), /approve it in the Lookout/);
  await assert.rejects(
    approveReroute(env, { mapId: t.mapId, id, by: 'trail lead', via: 'slack' }),
    /approve it in the Lookout/,
  );
  assert.equal((await t.adapter.loadMap(t.mapId)).map.mode, 'plan+execute');
  const declined = await rejectReroute(env, { mapId: t.mapId, id, by: 'slack:U1', note: 'No' });
  assert.equal(declined.status, 'rejected');
});

test('an approval with no evidence of what changed fails closed while the policy has high-risk path rules', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-no-evidence-'));
  assert.equal(needsLookout.approval(root, { mapId: 'm', ticketId: 't' }), true, 'no attempt');
  assert.equal(needsLookout.approval(root, { mapId: 'm', ticketId: 't', attemptId: 'A-9' }), true, 'unreadable');
});
