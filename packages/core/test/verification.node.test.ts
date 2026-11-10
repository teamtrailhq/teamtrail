import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseMapFile, serializeMapFile } from '../src/adapters/markdown/mapFile';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { parseTicket, serializeTicket } from '../src/adapters/markdown/ticketFile';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { joinBody, mapBody, ticketFromIssue, ticketMeta } from '../src/adapters/remote/format';
import { mapFromIssue } from '../src/adapters/remote/issueMapping';
import { applyWrite } from '../src/adapters/remote/sync/queuedWrites';
import { createTrackerBridge } from '../src/bridge';
import { serializeMapBody } from '../src/model/mapBody';
import type { MapDoc, Ticket } from '../src/model/types';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { chooseNext } from '../src/planning/operations/claims';
import { DEFAULT_CONFIG, parseVerificationConfig } from '../src/verification/config';
import { readVerificationConfig } from '../src/verification/configFile';
import {
  EVIDENCE_DIR,
  nextAttemptId,
  readAttempts,
  readVerdicts,
  writeAttempt,
  writeVerdict,
} from '../src/verification/evidenceStore';
import { outcomeOf } from '../src/verification/outcome';
import { verificationFor } from '../src/verification/policy';
import { acquireRunLock, readRunLock, recoverInterrupted, releaseRunLock, RUNS_DIR } from '../src/verification/runLock';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'teamtrail-verif-'));
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: '3',
  key: '#3',
  title: 'Ship it',
  type: 'execute',
  body: 'Do the thing',
  state: 'open',
  blockedBy: [],
  comments: [],
  createdAt: Date.parse('2026-10-31T10:00:00Z'),
  updatedAt: Date.parse('2026-10-31T10:00:00Z'),
  ...over,
});

const mapDoc = (over: Partial<MapDoc> = {}): MapDoc => ({
  id: 'm',
  key: 'm',
  title: 'Trail',
  mode: 'plan+execute',
  sections: SECTIONS,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

test('verification.json: defaults filled in, every problem reported, shell strings refused', () => {
  const ok = parseVerificationConfig(
    JSON.stringify({ v: 1, default: 'checks', checks: { test: { run: ['npm', 'test'] } }, run: ['test'] }),
  );
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.config?.default, 'checks');
  assert.equal(ok.config?.checks.test.timeoutSec, 600);
  assert.equal(ok.config?.maxAttempts, DEFAULT_CONFIG.maxAttempts);

  const bad = parseVerificationConfig(
    JSON.stringify({
      v: 2,
      default: 'paranoid',
      shell: true,
      checks: { lint: { run: 'npm run lint' }, empty: { run: [] } },
      run: ['lint', 'missing'],
      github: { pollSec: 5 },
    }),
  );
  assert.equal(bad.config, undefined);
  for (const want of [
    /"v" must be 1/,
    /"default" must be one of/,
    /unknown key "shell"/,
    /checks.lint.run must be an argv array, not a shell string/,
    /checks.empty.run must be a non-empty array/,
    /"run" names unknown check "missing"/,
    /pollSec" must be an integer of at least 15/,
  ])
    assert.ok(
      bad.errors.some((e) => want.test(e)),
      `${want} in ${bad.errors.join('; ')}`,
    );
  assert.match(parseVerificationConfig('{nope').errors[0], /not valid JSON/);
});

test('readVerificationConfig: missing file is not an error, the hash follows the bytes', () => {
  const root = tmp();
  assert.deepEqual(readVerificationConfig(root).exists, false);
  writeFileSync(path.join(root, 'verification.json'), '{"v":1}');
  const a = readVerificationConfig(root);
  writeFileSync(path.join(root, 'verification.json'), '{ "v": 1 }');
  const b = readVerificationConfig(root);
  assert.ok(a.config && b.config);
  assert.match(a.hash ?? '', /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(a.hash, b.hash);
});

test('level: ticket override, then the trail for the types it applies to, else off', () => {
  const config = { ...DEFAULT_CONFIG, run: ['test'] };
  assert.deepEqual(verificationFor(config, mapDoc(), ticket()), { level: 'off', source: 'none', checks: ['test'] });
  assert.equal(verificationFor(undefined, mapDoc(), ticket()).level, 'off');
  const trail = mapDoc({ verification: 'checks+review' });
  assert.equal(verificationFor(config, trail, ticket()).level, 'checks+review');
  assert.equal(verificationFor(config, trail, ticket()).source, 'trail');
  assert.equal(verificationFor(config, trail, ticket({ type: 'research' })).level, 'off');
  const own = verificationFor(config, trail, ticket({ type: 'research', verification: 'checks', checks: ['lint'] }));
  assert.deepEqual(own, { level: 'checks', source: 'ticket', checks: ['lint'] });
  assert.equal(verificationFor(config, trail, ticket({ verification: 'off' })).level, 'off');
});

test('stored fields round-trip in markdown and the remote meta marker; old files read back unchanged', () => {
  const plain = serializeTicket(ticket());
  assert.doesNotMatch(plain, /verification|checks/);
  assert.equal(serializeTicket(parseTicket(plain)), plain);

  const t = ticket({ verification: 'checks', checks: ['lint', 'test'], status: 'rework' });
  const back = parseTicket(serializeTicket(t));
  assert.equal(back.verification, 'checks');
  assert.deepEqual(back.checks, ['lint', 'test']);
  assert.equal(parseTicket(serializeTicket(ticket({ checks: [] }))).checks?.length, 0);
  assert.equal(parseTicket(plain.replace('state: open', 'state: open\nverification: bogus')).verification, undefined);

  const m = mapDoc({ verification: 'checks+review+human' });
  assert.equal(parseMapFile('m', serializeMapFile(m)).verification, 'checks+review+human');
  assert.doesNotMatch(serializeMapFile(mapDoc()), /verification/);

  const issue = {
    id: '3',
    key: '#3',
    title: 'Ship it',
    labels: ['teamtrail:execute'],
    body: joinBody('Do the thing', ticketMeta(t)),
    writer: { kind: 'self', name: 'octo-dev' } as const,
    closed: false,
    blockedBy: [],
    comments: [],
    createdAt: '2026-10-31T10:00:00Z',
    updatedAt: '2026-10-31T10:00:00Z',
  };
  const remote = ticketFromIssue(issue);
  assert.equal(remote.verification, 'checks');
  assert.deepEqual(remote.checks, ['lint', 'test']);
  assert.equal(remote.status, 'rework');
  assert.equal(remote.body, 'Do the thing');
  const trail = mapFromIssue({
    ...issue,
    labels: ['teamtrail:map'],
    body: joinBody('## Destination\n\nD', { verification: 'checks' }),
  });
  assert.equal(trail.verification, 'checks');
  assert.equal(trail.sections.destination, 'D');
});

test('setMeta sets and clears the verification fields without touching status', async () => {
  const a = new MemoryAdapter({ latency: [0, 0] });
  const { map, tickets } = await chartMap(a, {
    title: 'V',
    sections: SECTIONS,
    tickets: [{ ref: 'a', title: 'A', type: 'execute', body: '' }],
  });
  const id = tickets[0].id;
  const get = async () => (await a.loadMap(map.id)).tickets.find((t) => t.id === id)!;
  await a.setMeta(map.id, id, { status: 'verifying', verification: 'checks', checks: ['test'] });
  await a.setMeta(map.id, id, { checks: null });
  const t = await get();
  assert.equal(t.status, 'verifying');
  assert.equal(t.verification, 'checks');
  assert.equal('checks' in t, false);
  await a.setMeta(map.id, id, { verification: null });
  assert.equal((await get()).verification, undefined);
});

const attempt = (id: string, over: Partial<VerificationAttempt> = {}): VerificationAttempt => ({
  v: 1,
  id,
  mapId: 'm',
  ticketId: '3',
  ticketKey: '#3',
  agent: 'claude-07',
  level: 'checks',
  configHash: 'sha256:x',
  submittedAt: 1,
  finishedAt: 2,
  resolution: 'Done',
  checks: [],
  result: 'pass',
  ...over,
});

test('attempts and verdicts are numbered, written once, and kept out of git', () => {
  const root = tmp();
  assert.equal(nextAttemptId(root, 'm', '3'), 'A-1');
  writeAttempt(root, attempt('A-1'));
  assert.equal(readFileSync(path.join(root, EVIDENCE_DIR, '.gitignore'), 'utf8'), '*\n');
  assert.throws(() => writeAttempt(root, attempt('A-1', { result: 'fail' })), /EEXIST/);
  for (let n = 2; n <= 10; n++) writeAttempt(root, attempt(nextAttemptId(root, 'm', '3')));
  const all = readAttempts(root, 'm', '3');
  assert.deepEqual(
    all.map((a) => a.id),
    ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'A-7', 'A-8', 'A-9', 'A-10'],
  );
  assert.equal(all[0].result, 'pass');
  assert.equal(nextAttemptId(root, 'm', '3'), 'A-11');

  const base = { v: 1 as const, mapId: 'm', ticketId: '3', attemptId: 'A-1', at: 3, findings: [] };
  const v1 = writeVerdict(root, { ...base, by: 'codex-02', byKind: 'agent', verdict: 'FAIL', summary: 'no tests' });
  const v2 = writeVerdict(root, { ...base, by: 'trail lead', byKind: 'trail lead', verdict: 'PASS', summary: 'ok' });
  assert.deepEqual([v1.id, v2.id], ['V-1', 'V-2']);
  assert.deepEqual(
    readVerdicts(root, 'm', '3').map((v) => v.verdict),
    ['FAIL', 'PASS'],
  );
});

test('run lock: one run per ticket; a dead holder becomes an interrupted attempt', () => {
  const root = tmp();
  const { finishedAt: _f, checks: _c, result: _r, ...lock } = attempt('A-1');
  const first = acquireRunLock(root, lock);
  assert.equal(first.ok, true);
  const second = acquireRunLock(root, { ...lock, id: 'A-2' });
  assert.equal(second.ok, false);
  assert.equal(!second.ok && second.holder.id, 'A-1');
  releaseRunLock(root, 'm', '3', process.pid + 1);
  assert.ok(readRunLock(root, 'm', '3'), 'only the holder releases');
  releaseRunLock(root, 'm', '3');
  assert.equal(readRunLock(root, 'm', '3'), undefined);

  const dead = 2 ** 22 + 12345;
  mkdirSync(path.join(root, RUNS_DIR), { recursive: true });
  const file = path.join(root, RUNS_DIR, 'm--3.json');
  writeFileSync(file, JSON.stringify({ ...lock, id: 'A-1', pid: dead, startedAt: 5 }));
  const taken = acquireRunLock(root, { ...lock, id: 'A-2' }, 99);
  assert.ok(taken.ok);
  assert.equal(taken.ok && taken.recovered?.result, 'interrupted');
  assert.equal(taken.ok && taken.recovered?.id, 'A-1');
  assert.match(readAttempts(root, 'm', '3')[0].note ?? '', /stopped before the checks finished/);
  releaseRunLock(root, 'm', '3');

  writeFileSync(file, JSON.stringify({ ...lock, id: 'A-2', pid: dead, startedAt: 5 }));
  const recovered = recoverInterrupted(root, 100);
  assert.deepEqual(
    recovered.map((a) => [a.id, a.result, a.finishedAt]),
    [['A-2', 'interrupted', 100]],
  );
  assert.equal(existsSync(file), false);
  assert.deepEqual(recoverInterrupted(root), []);
});

test('GET /verification/config serves the parsed file read-only', async () => {
  const root = tmp();
  const bridge = createTrackerBridge(root, { env: {}, configDir: path.join(root, 'cfg'), leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/verification/config`;
  try {
    const none = (await (await fetch(url)).json()) as { exists: boolean; config?: unknown };
    assert.equal(none.exists, false);
    assert.equal(none.config, undefined);
    writeFileSync(path.join(root, 'verification.json'), '{"v":1}');
    const bare = (await (await fetch(url)).json()) as { config: { default: string } };
    assert.equal(bare.config.default, 'checks');
    writeFileSync(path.join(root, 'verification.json'), '{"v":1,"run":"npm test"}');
    const bad = (await (await fetch(url)).json()) as { errors: string[]; config?: unknown };
    assert.ok(bad.errors.length);
    assert.equal(bad.config, undefined);
    assert.equal((await fetch(url, { method: 'PUT', body: '{}' })).status, 404);
  } finally {
    server.close();
    bridge.close();
  }
});

test('outcome: pass is done at checks and waits for review above; fails rework until maxAttempts; errors need a human', () => {
  const check = {
    name: 'test',
    argv: ['npm', 'test'],
    cwd: '.',
    timedOut: false,
    durationMs: 5,
    log: 'x',
    tail: '',
    truncated: false,
  };
  const pass = attempt('A-1', { checks: [{ ...check, exitCode: 0 }] });
  assert.equal(outcomeOf(pass, 0, 3).to, 'done');
  assert.equal(outcomeOf({ ...pass, level: 'checks+review' }, 0, 3).to, 'verifying');
  const fail = attempt('A-2', { result: 'fail', checks: [{ ...check, exitCode: 1 }] });
  assert.deepEqual([outcomeOf(fail, 2, 3).to, outcomeOf(fail, 3, 3).to], ['rework', 'blocked']);
  assert.match(outcomeOf(fail, 2, 3).reason, /A-2 failed \(2 of 3 attempts\): test exited 1/);
  const error = attempt('A-3', { result: 'error', note: 'test: spawn npm ENOENT' });
  assert.deepEqual(outcomeOf(error, 0, 3), {
    event: 'checks.error',
    to: 'blocked',
    reason: 'A-3 could not verify: test: spawn npm ENOENT',
  });
});

test('trails keep their level from creation; issue bodies without one are unchanged', async () => {
  const root = tmp();
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map } = await chartMap(a, { title: 'V', sections: SECTIONS, verification: 'checks', tickets: [] });
  await a.updateMapSections(map.id, { notes: 'more' });
  assert.equal((await a.loadMap(map.id)).map.verification, 'checks');
  const { map: plain } = await chartMap(a, { title: 'P', sections: SECTIONS, tickets: [] });
  assert.equal((await a.loadMap(plain.id)).map.verification, undefined);
  assert.equal(mapBody(mapDoc()), serializeMapBody(SECTIONS));
  assert.equal(
    mapFromIssue({
      ...mapDoc({ verification: 'checks' }),
      labels: [],
      body: mapBody(mapDoc({ verification: 'checks' })),
      writer: { kind: 'self', name: 'octo-dev' } as const,
      createdAt: '',
      updatedAt: '',
    }).verification,
    'checks',
  );
});

test('chooseNext: rework before ready, oldest first', async () => {
  const a = new MemoryAdapter({ latency: [0, 0] });
  const { map, tickets } = await chartMap(a, {
    title: 'N',
    sections: SECTIONS,
    tickets: [
      { ref: 'a', title: 'A', type: 'execute', body: '' },
      { ref: 'b', title: 'B', type: 'execute', body: '' },
    ],
  });
  assert.equal(chooseNext(await a.loadMap(map.id))?.id, tickets[0].id);
  await a.setMeta(map.id, tickets[1].id, { status: 'rework' });
  assert.equal(chooseNext(await a.loadMap(map.id))?.id, tickets[1].id);
});

test('a queued trail level change applies to the cache and reaches the issue body marker', () => {
  const e = { snap: { map: mapDoc(), tickets: [] }, decisions: [], at: 0 };
  const w = (patch: { verification: 'checks' | null }) => ({
    id: 'w',
    mapId: 'm',
    label: 'trail verification',
    at: 0,
    change: { kind: 'mapMeta' as const, patch },
  });
  applyWrite(e, w({ verification: 'checks' }), () => 1);
  assert.equal(e.snap.map.verification, 'checks');
  assert.match(mapBody(e.snap.map), /teamtrail:meta \{"verification":"checks"\}/);
  applyWrite(e, w({ verification: null }), () => 2);
  assert.equal(e.snap.map.verification, undefined);
  assert.equal(mapBody(e.snap.map), serializeMapBody(SECTIONS));
});
