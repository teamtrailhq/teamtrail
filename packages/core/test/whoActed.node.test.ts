import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ActivityStream } from '../src/activity/activityStream';
import { signAgentAnswer } from '../src/agents/agentAnswerSignature';
import { writeAgentAnswer } from '../src/agents/agentDocs';
import { AgentDocWriter } from '../src/agents/agentDocWriter';
import { agentPaths } from '../src/agents/agentLink';
import { createProjectsHub, createTrackerBridge, type ExternalSignIn } from '../src/bridge';
import { personOf } from '../src/model/person';
import type { DecisionRecord } from '../src/model/types';
import { buildProof, proofMarkdown } from '../src/node';
import { parseDecision, serializeDecision } from '../src/planning/decisions/decisionFile';
import { sendJson } from '../src/server/http';
import { decisionFields } from '../src/signedState/stateFields';

/*
 * Who answered and who decided (S2): the person the sign-in in front of the bridge names, signed with the answer,
 * carried to the decision it backs, and shown; never what a request body says.
 */
const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-who-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ADA = { id: 'acc_ada', name: 'Ada Lovelace' };

function asking(root: string) {
  const activity = new ActivityStream();
  const writer = new AgentDocWriter(root, activity, { pollMs: 10 });
  const s = activity.startSession({ id: 's_1', agent: 'claude-01', mode: 'work', mapId: 'm1' });
  void s.ask('Ship the new pricing?');
  writer.flush();
  return { activity, writer, q: activity.snapshot.pending[0] };
}

test('an answer names who gave it, signed: the asking agent gets the person with the answer', async () => {
  const root = tmpRoot();
  const a = asking(root);
  writeAgentAnswer(root, {
    sessionId: 's_1',
    questionId: a.q.id,
    text: 'Yes',
    author: 'trail lead',
    via: 'lookout',
    by: ADA,
  });
  await wait(80);
  a.writer.close();
  const answered = a.activity.snapshot.answered[0];
  assert.deepEqual(answered.by, ADA);
  assert.equal(answered.via, 'lookout');
  assert.deepEqual(a.activity.snapshot.chats.at(-1)?.by, ADA);
});

test('a person renamed after signing, or added to an older answer, names nobody; the answer still counts', async () => {
  for (const tamper of ['rename', 'add'] as const) {
    const root = tmpRoot();
    const a = asking(root);
    const file = path.join(root, agentPaths.answer('s_1', a.q.id));
    const base = {
      sessionId: 's_1',
      questionId: a.q.id,
      text: 'Yes',
      author: 'trail lead',
      at: Date.now(),
      via: 'lookout' as const,
    };
    const signed = tamper === 'rename' ? signAgentAnswer(root, { ...base, by: ADA }) : signAgentAnswer(root, base);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...signed, by: { id: 'acc_mallory', name: 'The CTO' } }));
    await wait(80);
    a.writer.close();
    const answered = a.activity.snapshot.answered[0];
    assert.equal(answered.via, 'lookout', `${tamper}: the label still verifies`);
    assert.equal(answered.by, undefined, `${tamper}: nobody is named`);
  }
});

test('a person is kept to one line each, at most 100 characters; anything else is nobody', () => {
  assert.deepEqual(personOf({ id: ' acc_1 ', name: 'Ada\nLovelace' }), { id: 'acc_1', name: 'Ada Lovelace' });
  assert.equal(personOf({ id: 'x'.repeat(200), name: 'A' })?.id.length, 100);
  for (const bad of [undefined, null, 'Ada', { id: 'a' }, { id: 1, name: 'A' }, { id: ' ', name: 'A' }])
    assert.equal(personOf(bad), undefined);
});

const decision = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  id: 'D-1',
  mapId: 'm1',
  question: 'Ship the new pricing?',
  answer: 'Yes',
  summary: 'Ship it',
  alternatives: [],
  rationale: '',
  decidedBy: 'trail lead',
  decidedAt: Date.UTC(2026, 10, 15),
  participants: [{ id: 'claude-01' }, { id: 'trail lead' }],
  source: { kind: 'agent', label: 'claude-01 session' },
  transcript: [],
  ...over,
});

test('a decision keeps who made it through its file, its signed fields and its proof; an older one is unchanged', () => {
  const named = decision({ decidedByName: 'Ada Lovelace' });
  const back = parseDecision(serializeDecision(named));
  assert.equal(back.decidedByName, 'Ada Lovelace');
  assert.equal(back.decidedBy, 'trail lead', 'what gates read is unchanged');
  assert.equal(decisionFields(named).decided_by_name, 'Ada Lovelace');
  assert.equal(decisionFields(decision()).decided_by_name, null, 'an older record verifies as it did');
  assert.equal(parseDecision(serializeDecision(decision())).decidedByName, undefined);
  const ticket = { mapId: 'm1', id: '6', key: '#6', title: 'Pricing', type: 'execute' as const };
  const proof = buildProof({
    ticket,
    trail: 't',
    attempts: [],
    verdicts: [],
    decisions: [{ ...named, ticketId: '6' }],
  });
  assert.equal(proof.decisions[0].decidedByName, 'Ada Lovelace');
  assert.match(proofMarkdown(proof), /decided by Ada Lovelace \(trail lead\)/);
});

test("through the hub, the embedding server's person is recorded with the answer, never what the body says", async () => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-who-hub-'));
  const root = path.join(top, 'repo', '.teamtrail');
  mkdirSync(root, { recursive: true });
  const configDir = path.join(top, 'config');
  const HOST = 'ws-1.example.test';
  const external: ExternalSignIn = {
    admit: (_req, res, at) => {
      if (at.route === '/session') return void sendJson(res, 200, { signedIn: true });
      return { id: 'p-ada', kind: 'machine', person: ADA };
    },
  };
  const peer = () => '127.0.0.1';
  const options = { env: {}, configDir, peer, allowedHosts: [HOST], streamKey: () => 'one' };
  const bridge = createTrackerBridge(root, { ...options, cwd: path.dirname(root) });
  const hub = createProjectsHub({
    home: bridge,
    openBridge: (p) => createTrackerBridge(p.root, options),
    configDir,
    peer,
    allowedHosts: [HOST],
    external,
  });
  const server = http.createServer((req, res) => void hub.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const a = asking(root);
  try {
    const body = JSON.stringify({
      sessionId: 's_1',
      questionId: a.q.id,
      text: 'Yes',
      by: { id: 'acc_mallory', name: 'The CTO' },
    });
    const status = await new Promise<number>((resolve, reject) => {
      const port = (server.address() as { port: number }).port;
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: '/agents/answer',
          method: 'POST',
          headers: { Host: HOST, Origin: `http://${HOST}`, 'content-type': 'application/json' },
        },
        (res) => (res.resume(), res.on('end', () => resolve(res.statusCode ?? 0))),
      );
      req.on('error', reject);
      req.end(body);
    });
    assert.equal(status, 201);
    await wait(80);
    assert.deepEqual(a.activity.snapshot.answered[0].by, ADA);
  } finally {
    a.writer.close();
    hub.close();
    bridge.close();
    server.closeAllConnections();
    server.close();
  }
});
