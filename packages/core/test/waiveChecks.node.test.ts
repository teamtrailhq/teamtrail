import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge } from '../src/bridge';
import { journalFile } from '../src/history/journalFile';
import { derivePhases } from '../src/planning/lifecycle/phase';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { lookoutOnlyTickets } from '../src/policy/lookoutOnlyTickets';
import { proofForTicket } from '../src/proof/proofForTicket';
import { proofMarkdown } from '../src/proof/proofMarkdown';
import { activeWaivers } from '../src/verification/activeWaivers';
import { approvalItems } from '../src/verification/approvals';
import { readAttempts } from '../src/verification/evidenceStore';
import { undoWaiver } from '../src/verification/undoWaiver';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { waivableChecks } from '../src/verification/waivableChecks';
import { waiveChecks } from '../src/verification/waiveChecks';
import { approveAllHere } from './fakes/trailLead';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const FAILS = [process.execPath, '-e', 'process.exit(1)'];
const PASSES = [process.execPath, '-e', 'process.exit(0)'];

/** A repo whose one execute ticket has a `test` check that can't pass and an `ok` one that does. */
async function setup(maxAttempts = 1) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-waive-'));
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  const checks = { test: { run: FAILS }, ok: { run: PASSES } };
  const config = { v: 1, maxAttempts, failFast: true, checks, run: ['test', 'ok'] };
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify(config));
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Waive',
    sections: SECTIONS,
    verification: 'checks',
    tickets: [{ ref: 'a', title: 'A', type: 'execute', body: '' }],
  });
  const env = { adapter, root, journal: journalFile(root) };
  const id = tickets[0].id;
  const agent = { actor: 'Scout-1', actorKind: 'agent' as const };
  const complete = async () => {
    await transition(adapter, map.id, id, { ...agent, event: 'claim' });
    await transition(adapter, map.id, id, { ...agent, event: 'submit' });
    const snap = await adapter.loadMap(map.id);
    const t = snap.tickets[0];
    const info = levelFor(root, snap, t).info;
    await (
      await verify(env, { mapId: map.id, ticket: t, info, sub: { agent: 'Scout-1', resolution: 'did A' } })
    ).done;
  };
  await complete();
  const phase = async () => derivePhases((await adapter.loadMap(map.id)).tickets).get(id);
  const settle = async (want: string) => {
    for (let i = 0; i < 100 && (await phase()) !== want; i++) await new Promise((x) => setTimeout(x, 50));
    assert.equal(await phase(), want);
  };
  const shown = () => {
    const last = readAttempts(root, map.id, id).at(-1)!;
    return { attemptId: last.id, checks: waivableChecks(last).map((c) => ({ name: c.name, hash: c.hash })) };
  };
  const ask = { mapId: map.id, ticketId: id, reason: 'no test runner in this repo yet', via: 'lookout' as const };
  return { repo, root, adapter, env, mapId: map.id, id, phase, settle, complete, shown, ask: { ...ask, local: true } };
}

test('Accept without a failing check: the rest run again, the ticket is done, the proof says who skipped it', async () => {
  const s = await setup();
  assert.equal(await s.phase(), 'blocked');
  const shown = s.shown();
  assert.deepEqual(
    shown.checks.map((c) => c.name),
    ['test'],
  );
  const held = approvalItems(s.root, await s.adapter.loadMap(s.mapId));
  assert.deepEqual(held[0].waivable, ['test']);
  const stale = { ...shown, checks: [{ name: 'test', hash: 'sha256:other' }] };
  await assert.rejects(waiveChecks(s.env, { ...s.ask, ...stale }), /changed since you opened it/);
  await assert.rejects(waiveChecks(s.env, { ...s.ask, ...shown, reason: ' ' }), /Say why/);
  await assert.rejects(waiveChecks(s.env, { ...s.ask, ...shown, attemptId: 'A-0' }), /newer completion/);
  const r = await waiveChecks(s.env, { ...s.ask, ...shown, person: 'Ada' });
  assert.equal(r.attemptId, 'A-2');
  await s.settle('done');
  const a2 = readAttempts(s.root, s.mapId, s.id).at(-1)!;
  assert.deepEqual(
    a2.checks.map((c) => c.name),
    ['ok'],
  );
  assert.deepEqual(
    a2.waived?.map((w) => [w.name, w.by, w.reason]),
    [['test', 'Ada', 'no test runner in this repo yet']],
  );
  const decisions = await s.adapter.listDecisions(s.mapId);
  const d = decisions.find((x) => x.source.ref === `waiver:${r.waiver}`)!;
  assert.equal(d.decidedBy, 'trail lead');
  assert.equal(d.decidedByName, 'Ada');
  assert.equal(d.source.kind, 'lookout');
  const events = journalFile(s.root).readAll(s.mapId);
  assert.ok(events.some((e) => e.kind === 'transition' && e.event === 'waive' && e.actorKind === 'trail lead'));
  assert.deepEqual(
    journalFile(s.root)
      .readWaivers(s.mapId)
      .map((e) => [e.action, e.checks]),
    [['waived', ['test']]],
  );
  const snap = await s.adapter.loadMap(s.mapId);
  const proof = proofForTicket({ root: s.root, snap, ticket: snap.tickets[0], decisions });
  assert.equal(proof.status, 'not-verified');
  assert.ok(proof.gaps.includes("test didn't run: Ada accepted the work without it."));
  assert.match(proofMarkdown(proof), /skipped by Ada: no test runner in this repo yet/);
});

test('a waiver holds for the ticket: claimed again, its next completion goes without the check', async () => {
  const s = await setup(3);
  assert.equal(await s.phase(), 'rework');
  const shown = s.shown();
  await transition(s.adapter, s.mapId, s.id, { actor: 'Scout-1', actorKind: 'agent', event: 'claim' });
  const r = await waiveChecks(s.env, { ...s.ask, ...shown });
  assert.equal(r.attemptId, undefined);
  assert.equal(await s.phase(), 'working');
  await transition(s.adapter, s.mapId, s.id, { actor: 'Scout-1', actorKind: 'agent', event: 'submit' });
  const snap = await s.adapter.loadMap(s.mapId);
  const t = snap.tickets[0];
  const info = levelFor(s.root, snap, t).info;
  const job = { mapId: s.mapId, ticket: t, info, sub: { agent: 'Scout-1', resolution: 'did A' } };
  await (
    await verify(s.env, job)
  ).done;
  assert.equal(await s.phase(), 'done');
});

test('rework: accepting without the check re-runs the same submission at once', async () => {
  const s = await setup(3);
  assert.equal(await s.phase(), 'rework');
  await waiveChecks(s.env, { ...s.ask, ...s.shown() });
  await s.settle('done');
});

test('Undo: the check runs again, the decision is superseded, a ticket that closed on it reopens', async () => {
  const s = await setup();
  const r = await waiveChecks(s.env, { ...s.ask, ...s.shown() });
  await s.settle('done');
  await undoWaiver(s.env, { mapId: s.mapId, ticketId: s.id, via: 'lookout' });
  assert.equal(await s.phase(), 'ready');
  assert.deepEqual(activeWaivers(s.root, s.mapId, s.id), []);
  const decisions = await s.adapter.listDecisions(s.mapId);
  assert.ok(decisions.find((d) => d.source.ref === `waiver:${r.waiver}`)?.supersededBy);
  await assert.rejects(undoWaiver(s.env, { mapId: s.mapId, ticketId: s.id, via: 'lookout' }), /no waived check/);
  await s.complete();
  assert.deepEqual(
    readAttempts(s.root, s.mapId, s.id)
      .at(-1)!
      .checks.map((c) => c.name),
    ['test'],
  );
  assert.equal(await s.phase(), 'blocked');
});

test('only the Lookout waives, and on a high-risk ticket only the Lookout on this machine', async () => {
  const s = await setup();
  const shown = s.shown();
  await assert.rejects(waiveChecks(s.env, { ...s.ask, ...shown, via: 'slack' }), /Lookout only/);
  await assert.rejects(waiveChecks(s.env, { ...s.ask, ...shown, via: 'chat' }), /Lookout only/);
  lookoutOnlyTickets.mark(s.root, { mapId: s.mapId, ticketId: s.id, categories: ['auth-permissions'] });
  await assert.rejects(waiveChecks(s.env, { ...s.ask, ...shown, via: 'lookout-limited' }), /high risk/);
  await assert.rejects(waiveChecks(s.env, { ...s.ask, ...shown, local: false }), /high risk/);
  assert.deepEqual(activeWaivers(s.root, s.mapId, s.id), []);
  await waiveChecks(s.env, { ...s.ask, ...shown });
  await s.settle('done');
});

test('a waiver covers the command it was given for: a changed command runs again', async () => {
  const s = await setup(3);
  await transition(s.adapter, s.mapId, s.id, { actor: 'Scout-1', actorKind: 'agent', event: 'claim' });
  await waiveChecks(s.env, { ...s.ask, ...s.shown() });
  const config = {
    v: 1,
    maxAttempts: 3,
    checks: { test: { run: [...FAILS, 'x'] }, ok: { run: PASSES } },
    run: ['test'],
  };
  writeFileSync(path.join(s.root, 'verification.json'), JSON.stringify(config));
  approveAllHere(s.root);
  await transition(s.adapter, s.mapId, s.id, { actor: 'Scout-1', actorKind: 'agent', event: 'submit' });
  const snap = await s.adapter.loadMap(s.mapId);
  const info = levelFor(s.root, snap, snap.tickets[0]).info;
  const job = { mapId: s.mapId, ticket: snap.tickets[0], info, sub: { agent: 'Scout-1', resolution: 'did A' } };
  await (
    await verify(s.env, job)
  ).done;
  const last = readAttempts(s.root, s.mapId, s.id).at(-1)!;
  assert.deepEqual([last.checks.map((c) => c.name), last.waived], [['test'], undefined]);
});

test('routes: waive and undo over the bridge, never cross-site, with the shown hashes', async () => {
  const s = await setup();
  const bridge = createTrackerBridge(s.root, {
    env: {},
    configDir: path.join(s.repo, 'cfg'),
    leases: { reapMs: 60_000 },
  });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/verification`;
  const post = (p: string, body: unknown, type = 'application/json') =>
    fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': type }, body: JSON.stringify(body) });
  try {
    const rec = (await (await fetch(`${base}/ticket?mapId=${s.mapId}&ticketId=${s.id}`)).json()) as {
      attempts: { id: string }[];
      waivable: { name: string; hash: string }[];
    };
    const body = {
      mapId: s.mapId,
      ticketId: s.id,
      attemptId: rec.attempts[0].id,
      checks: rec.waivable.map((c) => ({ name: c.name, hash: c.hash })),
      reason: 'no runner',
    };
    assert.equal((await post('/waive', body, 'text/plain')).status, 403);
    assert.equal((await post('/waive', { ...body, reason: '' })).status, 400);
    assert.equal((await post('/waive', { ...body, checks: [{ name: 'test', hash: 'x' }] })).status, 409);
    const ok = await post('/waive', body);
    assert.equal(ok.status, 200);
    await s.settle('done');
    const after = (await (await fetch(`${base}/ticket?mapId=${s.mapId}&ticketId=${s.id}`)).json()) as {
      waivers: { checks: { name: string }[] }[];
    };
    assert.deepEqual(
      after.waivers.map((w) => w.checks.map((c) => c.name)),
      [['test']],
    );
    assert.equal((await post('/waive/undo', { mapId: s.mapId, ticketId: s.id })).status, 200);
    assert.equal(await s.phase(), 'ready');
  } finally {
    server.close();
    bridge.close();
  }
});
