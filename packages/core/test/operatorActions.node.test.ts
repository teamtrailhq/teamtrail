import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { agentPaths } from '../src/agents/agentLink';
import { createTrackerBridge } from '../src/bridge';
import { journalFile } from '../src/history/journalFile';
import { writeLocalJson } from '../src/lib/ensureLocalDir';
import type { VerificationLevel } from '../src/model/lifecycle';
import { derivePhases } from '../src/planning/lifecycle/phase';
import { setVerification } from '../src/planning/lifecycle/setVerification';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { verificationEvents } from '../src/server/verificationEvents';
import { readAttempts, readVerdicts } from '../src/verification/evidenceStore';
import { operatorAction } from '../src/verification/operatorActions';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const CHECK = `process.exit(require('fs').existsSync('ok') ? 0 : 1)`;

/** A repo whose tracker folder has one execute ticket that failed its checks and went to rework or blocked. */
async function setup(level: VerificationLevel = 'checks', maxAttempts = 3) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-op-'));
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, maxAttempts, checks: { ok: { run: [process.execPath, '-e', CHECK] } }, run: ['ok'] }),
  );
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Op',
    sections: SECTIONS,
    verification: level,
    tickets: [{ ref: 'a', title: 'A', type: 'execute', body: '' }],
  });
  const env = { adapter, root, journal: journalFile(root) };
  const id = tickets[0].id;
  const agent = { actor: 'Scout-1', actorKind: 'agent' as const };
  await transition(adapter, map.id, id, { ...agent, event: 'claim' });
  await transition(adapter, map.id, id, { ...agent, event: 'submit' });
  const run = async () => {
    const snap = await adapter.loadMap(map.id);
    const t = snap.tickets[0];
    await (
      await verify(env, {
        mapId: map.id,
        ticket: t,
        info: levelFor(root, snap, t).info,
        sub: { agent: 'Scout-1', resolution: 'did A' },
      })
    ).done;
  };
  await run();
  const resubmit = async () => {
    await transition(adapter, map.id, id, { ...agent, event: 'claim' });
    await transition(adapter, map.id, id, { ...agent, event: 'submit' });
    await run();
  };
  const phase = async () => derivePhases((await adapter.loadMap(map.id)).tickets).get(id);
  return { repo, root, adapter, env, mapId: map.id, id, phase, resubmit };
}

test('rerun: a blocked ticket is verified again on its last submission and passes to done', async () => {
  const s = await setup('checks', 1);
  assert.equal(await s.phase(), 'blocked');
  writeFileSync(path.join(s.repo, 'ok'), '');
  const r = await operatorAction(s.env, { action: 'rerun', mapId: s.mapId, ticketId: s.id, by: 'trail lead' });
  assert.equal(r.attemptId, 'A-2');
  for (let i = 0; i < 100 && (await s.phase()) !== 'done'; i++) await new Promise((x) => setTimeout(x, 50));
  assert.equal(await s.phase(), 'done');
  const a = readAttempts(s.root, s.mapId, s.id);
  assert.deepEqual(
    a.map((x) => [x.id, x.result, x.resolution]),
    [
      ['A-1', 'fail', 'did A'],
      ['A-2', 'pass', 'did A'],
    ],
  );
  const events = journalFile(s.root)
    .read(s.mapId)
    .map((e) => `${e.event}:${e.actorKind}`);
  assert.deepEqual(events.slice(-2), ['unblock:trail lead', 'checks.pass:engine']);
});

test('approve and rework are the trail lead calls on a verifying ticket, kept as verdicts', async () => {
  const s = await setup('checks+review');
  writeFileSync(path.join(s.repo, 'ok'), '');
  const base = { mapId: s.mapId, ticketId: s.id, by: 'trail lead' };
  await s.resubmit();
  assert.equal(await s.phase(), 'verifying');
  await assert.rejects(operatorAction(s.env, { ...base, action: 'rework' }), /needs a reason/);
  await operatorAction(s.env, { ...base, action: 'rework', reason: 'name the flag' });
  assert.equal(await s.phase(), 'rework');
  const t = (await s.adapter.loadMap(s.mapId)).tickets[0];
  assert.match(t.comments.at(-1)!.body, /Sent back to rework[\s\S]*name the flag/);
  await s.resubmit();
  await operatorAction(s.env, { ...base, action: 'approve' });
  assert.equal(await s.phase(), 'done');
  assert.deepEqual(
    readVerdicts(s.root, s.mapId, s.id).map((v) => [v.verdict, v.byKind, v.attemptId]),
    [
      ['FAIL', 'trail lead', 'A-2'],
      ['PASS', 'trail lead', 'A-3'],
    ],
  );
});

test('approve is refused once the code no longer matches the verified attempt', async () => {
  const s = await setup('checks+review');
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...a], { cwd: s.repo });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'init');
  writeFileSync(path.join(s.repo, 'ok'), '');
  await s.resubmit();
  assert.equal(await s.phase(), 'verifying');
  writeFileSync(path.join(s.repo, 'later.txt'), 'edited after the checks');
  const base = { mapId: s.mapId, ticketId: s.id, by: 'trail lead' };
  await assert.rejects(operatorAction(s.env, { ...base, action: 'approve' }), /no longer matches the code.*re-run/);
  await operatorAction(s.env, { ...base, action: 'accept', reason: 'reviewed the later edit' });
  assert.equal(await s.phase(), 'done');
});

test('unblock needs a target and a reason; levels are set by the trail lead only', async () => {
  const s = await setup('checks', 1);
  const base = { mapId: s.mapId, ticketId: s.id, by: 'trail lead', reason: 'flaky runner' };
  await assert.rejects(operatorAction(s.env, { ...base, action: 'unblock' }), /ready or rework/);
  await operatorAction(s.env, { ...base, action: 'unblock', to: 'ready' });
  assert.equal(await s.phase(), 'ready');
  await operatorAction(s.env, { ...base, action: 'level', level: 'off' });
  await operatorAction(s.env, { mapId: s.mapId, by: 'trail lead', action: 'level', level: 'checks+review' });
  const snap = await s.adapter.loadMap(s.mapId);
  assert.equal(snap.tickets[0].verification, 'off');
  assert.equal(snap.map.verification, 'checks+review');
  await operatorAction(s.env, { mapId: s.mapId, by: 'trail lead', action: 'level', level: null });
  assert.equal((await s.adapter.loadMap(s.mapId)).map.verification, undefined);
  await assert.rejects(setVerification(s.adapter, { mapId: s.mapId }, 'off', 'agent'), /only the trail lead/);
});

test('verification routes: ticket record, logs confined to .evidence, actions refused cross-site', async () => {
  const s = await setup();
  const bridge = createTrackerBridge(s.root, {
    env: {},
    configDir: path.join(s.repo, 'cfg'),
    leases: { reapMs: 60_000 },
  });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/verification`;
  try {
    const rec = (await (await fetch(`${base}/ticket?mapId=${s.mapId}&ticketId=${s.id}`)).json()) as {
      level: { level: string; source: string };
      attempts: { id: string; checks: { log: string }[] }[];
    };
    assert.deepEqual([rec.level.level, rec.level.source, rec.attempts[0].id], ['checks', 'trail', 'A-1']);
    const log = await fetch(`${base}/log?path=${encodeURIComponent(rec.attempts[0].checks[0].log)}`);
    assert.equal(log.status, 200);
    assert.equal((await fetch(`${base}/log?path=${encodeURIComponent('../verification.json')}`)).status, 404);
    assert.equal((await fetch(`${base}/log?path=${encodeURIComponent('.evidence/../../x.log')}`)).status, 404);
    const post = (body: unknown, type = 'application/json') =>
      fetch(`${base}/action`, { method: 'POST', headers: { 'Content-Type': type }, body: JSON.stringify(body) });
    assert.equal((await post({ action: 'approve', mapId: s.mapId, ticketId: s.id }, 'text/plain')).status, 403);
    assert.equal((await post({ action: 'nope', mapId: s.mapId })).status, 400);
    assert.equal((await post({ action: 'approve', mapId: s.mapId, ticketId: s.id })).status, 409);
  } finally {
    server.close();
    bridge.close();
  }
});

test('verification events: one per ticket per burst, from evidence and run lock paths', async () => {
  const sent: string[] = [];
  const notify = verificationEvents((t) => sent.push(t));
  assert.equal(notify('m/map.md'), false);
  for (const p of ['.evidence/m/3/A-1/ok.log', '.evidence/m/3/A-1.json', '.agents/runs/m--3.json', '.evidence'])
    assert.equal(notify(p), true);
  await new Promise((x) => setTimeout(x, 400));
  assert.deepEqual(sent, ['event: verification\ndata: {"kind":"evidence","mapId":"m","ticketId":"3"}\n\n']);
  notify.close();
});

test('from Slack, approving or accepting work on a high-risk ticket is refused in core; from the Lookout it goes', async () => {
  const s = await setup('checks', 1);
  assert.equal(await s.phase(), 'blocked');
  // an agent asked about this ticket with a category the policy makes high
  writeLocalJson(s.root, agentPaths.session('s1'), {
    v: 1,
    session: {
      id: 's1',
      agent: 'Scout-1',
      mode: 'work',
      mapId: s.mapId,
      ticketId: s.id,
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
        mapId: s.mapId,
        ticketId: s.id,
        agent: 'Scout-1',
        text: 'Drop it?',
        at: Date.now(),
        category: 'schema',
      },
    ],
    answered: [],
    feed: [],
    pid: process.pid,
    updatedAt: Date.now(),
  });
  const accept = (by: string, via?: 'slack') =>
    operatorAction(s.env, {
      action: 'accept',
      mapId: s.mapId,
      ticketId: s.id,
      by,
      reason: 'fine',
      ...(via ? { via } : {}),
    });
  await assert.rejects(accept('slack:U1'), /is high risk: decide it in the Lookout/);
  await assert.rejects(accept('trail lead', 'slack'), /is high risk: decide it in the Lookout/);
  assert.equal(await s.phase(), 'blocked');
  await accept('trail lead');
  assert.equal(await s.phase(), 'done');
});
