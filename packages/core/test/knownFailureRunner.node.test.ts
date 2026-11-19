import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { flagSource } from '../src/attention/sources/flagSource';
import { mergeSource } from '../src/attention/sources/mergeSource';
import type { AttentionInput } from '../src/attention/types';
import { createTrackerBridge } from '../src/bridge';
import { writeTicketCriteria } from '../src/criteria/criteriaStore';
import { journalFile } from '../src/history/journalFile';
import { chooseMain } from '../src/mainChecks/chooseMain';
import { requestMainRun } from '../src/mainChecks/requestMainRun';
import { derivePhases } from '../src/planning/lifecycle/phase';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { lookoutOnlyTickets } from '../src/policy/lookoutOnlyTickets';
import { gapsHash } from '../src/proof/gapsHash';
import { mergeAcceptances } from '../src/proof/mergeAcceptances';
import { mergeAnyway } from '../src/proof/mergeAnyway';
import { proofForTicket } from '../src/proof/proofForTicket';
import { trustKey, trustLedger } from '../src/trust/trustLedger';
import type { CheckRunner, RunnerReport } from '../src/verification/checkRunner';
import { readAttempts } from '../src/verification/evidenceStore';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
/** What the Cloud runner printed, on main and on the agent's branch alike: the sandbox had no eslint installed. */
const OUTPUT =
  '\n> web:lint\n> npm --prefix apps/web run lint\n\n\n> @padeleye/web@0.1.0 lint\n> eslint .\n\nsh: 1: eslint: not found';
const MAIN = 'c'.repeat(40);
const BRANCH = 'e'.repeat(40);

const lintFails = (job: { checks: { name: string }[] }) =>
  job.checks.map((c) => ({ name: c.name, exitCode: 127, timedOut: false, durationMs: 160, output: OUTPUT }));

/** A Cloud-like runner: `lint` exits 127 on main and on the branch, with the same output. */
const runner: CheckRunner = {
  name: 'Teamtrail Cloud',
  run: (job): Promise<RunnerReport> =>
    Promise.resolve({
      checks: lintFails(job),
      git: {
        head: BRANCH,
        branch: 'teamtrail/simple-component/1',
        base: { head: MAIN, branch: 'main' },
        changed: [{ path: 'apps/web/components/HelloWorld.tsx', add: 7, del: 0 }],
      },
    }),
  runMain: (job) =>
    Promise.resolve({
      checks: lintFails(job),
      // on exactly the commit asked for, as Cloud's runner does; MAIN when none was named
      git: { head: job.commit ?? MAIN, branch: 'main', base: { head: null, branch: null }, changed: [] },
    }),
};

async function setup() {
  const repo = tempFolder('teamtrail-known-runner-');
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  writeFileSync(path.join(repo, '.gitignore'), '.teamtrail\n');
  const checks = { lint: { run: ['npm', 'run', 'web:lint'] } };
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, checks, run: ['lint'] }));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo });
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Simple component',
    sections: SECTIONS,
    verification: 'checks',
    tickets: [{ ref: 'a', title: 'Hello world', type: 'execute', body: '' }],
  });
  trustLedger(root).set({
    [trustKey.discoverySkipped(map.id)]: { hash: 'x', at: Date.now(), by: 'trail lead', content: '' },
  });
  const t = tickets[0];
  const criteria = [{ id: 'AC-1', text: 'npm run web:lint succeeds', kind: 'unit' as const }];
  writeTicketCriteria(root, map, t, { criteria });
  writeTicketCriteria(root, map, t, { confirmed: true });
  approveAllHere(root);
  return { root, adapter, mapId: map.id, ticketId: t.id };
}

test('runner-graded, Start anyway: the first completion failing only as main does passes with known failures', async () => {
  const { root, adapter, mapId, ticketId } = await setup();
  // checks on main fail in lint; the trail lead chooses Start anyway before any agent builds
  const start = requestMainRun({ root, checkRunner: runner }, { mapId });
  if (start.kind !== 'started') return assert.fail(`expected a run on main, got ${start.kind}`);
  assert.equal((await start.done).result, 'fail');
  chooseMain({ root, mapId, choice: { kind: 'proceed' } });

  const agent = { actor: 'claude-01', actorKind: 'agent' as const };
  await transition(adapter, mapId, ticketId, { ...agent, event: 'claim' });
  await transition(adapter, mapId, ticketId, { ...agent, event: 'submit' });
  const snap = await adapter.loadMap(mapId);
  const ticket = snap.tickets[0];
  const env = { adapter, root, journal: journalFile(root), checkRunner: runner };
  const sub = {
    agent: 'claude-01',
    resolution: 'Added HelloWorld',
    remote: true,
    origin: 'token:rt_1',
    declaredPaths: ['apps/web/components/HelloWorld.tsx'],
    // the agent names the failing check as its evidence, as the real one did
    criteria: [{ id: 'AC-1', evidence: 'check:lint', note: 'lint passes in my checkout' }],
  };
  const run = await verify(env, { mapId, ticket, info: levelFor(root, snap, ticket).info, sub });
  const settled = await run.done;

  const a1 = readAttempts(root, mapId, ticketId)[0];
  assert.equal(a1.id, 'A-1');
  assert.equal(a1.runner, 'Teamtrail Cloud');
  assert.equal(a1.result, 'pass');
  assert.deepEqual(
    a1.knownFailures?.map((k) => k.name),
    ['lint'],
  );
  assert.deepEqual(a1.criteria?.failed, []);
  assert.deepEqual(a1.criteria?.claimed, ['AC-1']);
  assert.match(a1.criteria?.lines[0] ?? '', /check:lint \(already failing on main\)/);
  assert.equal(settled.phase, 'done');
  assert.equal(derivePhases((await adapter.loadMap(mapId)).tickets).get(ticketId), 'done');
});

/** A done ticket whose proof isn't verified: lint repeated its known failure on main. */
async function doneUnverified() {
  const s = await setup();
  const start = requestMainRun({ root: s.root, checkRunner: runner }, { mapId: s.mapId });
  if (start.kind === 'started') await start.done;
  chooseMain({ root: s.root, mapId: s.mapId, choice: { kind: 'proceed' } });
  const agent = { actor: 'claude-01', actorKind: 'agent' as const };
  await transition(s.adapter, s.mapId, s.ticketId, { ...agent, event: 'claim' });
  await transition(s.adapter, s.mapId, s.ticketId, { ...agent, event: 'submit' });
  const snap = await s.adapter.loadMap(s.mapId);
  const ticket = snap.tickets[0];
  const env = { adapter: s.adapter, root: s.root, journal: journalFile(s.root), checkRunner: runner };
  const criteria = [{ id: 'AC-1', evidence: 'check:lint' }];
  const sub = { agent: 'claude-01', resolution: 'Added HelloWorld', remote: true, criteria };
  await (
    await verify(env, { mapId: s.mapId, ticket, info: levelFor(s.root, snap, ticket).info, sub })
  ).done;
  const proof = async () => {
    const now = await s.adapter.loadMap(s.mapId);
    const decisions = await s.adapter.listDecisions(s.mapId);
    return proofForTicket({ root: s.root, snap: now, ticket: now.tickets[0], decisions });
  };
  return { ...s, proof };
}

test("Merge anyway: the trail lead accepts the gaps shown, kept as their decision, journaled, for the proof's commit", async () => {
  const s = await doneUnverified();
  const p = await s.proof();
  assert.equal(p.status, 'not-verified');
  assert.ok(p.gaps.some((g) => /already failing on main: lint/.test(g)));
  const env = { adapter: s.adapter, root: s.root };
  const ask = { mapId: s.mapId, ticketId: s.ticketId, gaps: p.gaps, via: 'lookout' as const };
  await assert.rejects(mergeAnyway(env, { ...ask, via: 'slack' }), /Lookout only/);
  await assert.rejects(mergeAnyway(env, { ...ask, gaps: ['something else'] }), /changed since you looked/);
  const r = await mergeAnyway(env, { ...ask, person: 'Ada' });
  assert.equal(r.gapsHash, gapsHash({ head: BRANCH, gaps: p.gaps }));
  const kept = mergeAcceptances.covering(s.root, { mapId: s.mapId, ticketId: s.ticketId, gapsHash: r.gapsHash });
  assert.equal(kept?.head, BRANCH);
  assert.equal(kept?.by, 'Ada');
  const d = (await s.adapter.listDecisions(s.mapId)).find((x) => x.source.ref === `merge:${r.acceptance}`);
  assert.equal(d?.decidedBy, 'trail lead');
  assert.equal(d?.decidedByName, 'Ada');
  assert.equal(d?.source.kind, 'lookout');
  assert.match(d?.rationale ?? '', /already failing on main: lint/);
  assert.deepEqual(
    journalFile(s.root)
      .readMergeAnyway(s.mapId)
      .map((e) => [e.ticketId, e.head, e.actor]),
    [[s.ticketId, BRANCH, 'Ada']],
  );
  // the decision doesn't change the gaps: the same hash still covers them
  assert.equal(gapsHash({ head: BRANCH, gaps: (await s.proof()).gaps }), r.gapsHash);
  // a high-risk ticket: only a Lookout caller allowed high-risk calls
  lookoutOnlyTickets.mark(s.root, { mapId: s.mapId, ticketId: s.ticketId, categories: ['auth-permissions'] });
  await assert.rejects(mergeAnyway(env, { ...ask, via: 'lookout-limited' }), /high risk/);
  await mergeAnyway(env, ask);
});

test('POST /proof/merge-anyway: same-site JSON only; GET /proof/ticket gives the gaps hash and who accepted them', async () => {
  const s = await doneUnverified();
  const bridge = createTrackerBridge(s.root, { env: {}, leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/proof`;
  const post = (body: unknown, type = 'application/json') =>
    fetch(`${base}/merge-anyway`, { method: 'POST', headers: { 'Content-Type': type }, body: JSON.stringify(body) });
  const ticket = async () =>
    (await (await fetch(`${base}/ticket?mapId=${s.mapId}&ticketId=${s.ticketId}`)).json()) as {
      proof: { gaps: string[] };
      gapsHash: string;
      mergeAnyway?: { by: string };
    };
  try {
    const before = await ticket();
    assert.equal(before.mergeAnyway, undefined);
    const body = { mapId: s.mapId, ticketId: s.ticketId, gaps: before.proof.gaps };
    assert.equal((await post(body, 'text/plain')).status, 403);
    assert.equal((await post({ ...body, gaps: [] })).status, 400);
    assert.equal((await post({ ...body, gaps: ['not what it says'] })).status, 409);
    const ok = await post(body);
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { gapsHash: string }).gapsHash, before.gapsHash);
    assert.equal((await ticket()).mergeAnyway?.by, 'trail lead');
  } finally {
    server.close();
    bridge.close();
  }
});

test('a done ticket with an open pull request is one "ready to merge" item, not a PR / CI flag', async () => {
  const s = await doneUnverified();
  const snap = await s.adapter.loadMap(s.mapId);
  const pr = { number: 2, state: 'open', headSha: BRANCH } as NonNullable<AttentionInput['syncs'][number]['pr']>;
  const text = 'Ticket is done but PR #2 is still open';
  const flag = { kind: 'done-pr-open' as const, severity: 'warn' as const, text, since: 5 };
  const sync = { mapId: s.mapId, ticketId: s.ticketId, ticketKey: '#1', flags: [flag], pr };
  const input = { snaps: [snap], syncs: [sync], now: 10 } as unknown as AttentionInput;
  const [item, ...rest] = mergeSource.collect(input);
  assert.equal(rest.length, 0);
  assert.equal(item.title, '#1: PR #2 ready to merge');
  assert.equal(item.since, 5);
  assert.equal(item.urgency, 'soon');
  assert.deepEqual(flagSource.collect(input), []);
  // merged: nothing to merge
  const merged = { ...sync, pr: { ...pr, state: 'merged' as const }, flags: [] };
  assert.deepEqual(mergeSource.collect({ ...input, syncs: [merged] }), []);
});
