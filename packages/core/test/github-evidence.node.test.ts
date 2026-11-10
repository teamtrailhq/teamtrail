import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { TrackerAdapter } from '../src/adapters/adapter';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge } from '../src/bridge';
import { foldChecks, summarizeChecks } from '../src/evidence/github/checkState';
import { GitHubCiProvider } from '../src/evidence/github/GitHubCiProvider';
import { bodyMarkers, branchRef, untrusted } from '../src/evidence/github/prText';
import { prSyncView } from '../src/evidence/prSyncView';
import { reconcile } from '../src/evidence/reconcile';
import { readTicketSync, readTicketSyncs, writeTicketSync } from '../src/evidence/syncStore';
import type { GitEvidence } from '../src/model/evidence';
import type { CiCheck, FlagEntry, PrSyncStatus, VerificationSyncEvent } from '../src/model/prEvidence';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { watchVerification } from '../src/server/watchVerification';
import { writeAttempt } from '../src/verification/evidenceStore';
import { fakeGitHubPulls } from './fakes/githubPulls';
import { approveAllHere } from './fakes/trailLead';

const TOKEN = 'ghp_FAKEtoken0123456789abcdefghijkl';
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'teamtrail-ghev-'));
const gitOf = (branch: string | null, head: string): GitEvidence => ({
  v: 1,
  tree: { toplevel: '/repo', head, branch, fingerprint: 'sha256:0' },
  changed: [],
  stats: { files: 0, add: 0, del: 0 },
  flags: [],
});
const ids = (c: CiCheck[]) => c.map((x) => `${x.name}:${x.state}${x.required ? '' : '?'}`);

const WRITES = [
  'createMap',
  'setMapMode',
  'updateMapSections',
  'createTicket',
  'addBlocking',
  'assign',
  'comment',
  'close',
  'setMeta',
  'createDecision',
  'markSuperseded',
];

/** The adapter as the reconciler sees it: any write throws. */
function readOnly(a: TrackerAdapter): TrackerAdapter {
  return new Proxy(a, {
    get(t, k, r) {
      if (WRITES.includes(String(k))) return () => assert.fail(`reconciler wrote to the tracker: ${String(k)}`);
      const v = Reflect.get(t, k, r);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

async function setup() {
  const root = tmp();
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(a, {
    title: 'PRs',
    sections: SECTIONS,
    tickets: [
      { ref: 'a', title: 'By branch', type: 'execute', body: '' },
      { ref: 'b', title: 'By marker', type: 'execute', body: '' },
      { ref: 'c', title: 'Unlinked', type: 'execute', body: '' },
    ],
  });
  const gh = fakeGitHubPulls();
  const provider = new GitHubCiProvider({ repo: gh.repo, token: TOKEN, fetch: gh.fetch, sleep: async () => {} });
  let clock = Date.UTC(2026, 9, 31, 13, 0, 0);
  const tick = (requiredChecks: string[] = []) =>
    reconcile({ root, adapter: readOnly(a), provider, requiredChecks, now: () => (clock += 60_000) });
  return { root, a, mapId: map.id, t: tickets, gh, provider, tick };
}

const flags = (root: string, mapId: string, id: string) =>
  readTicketSync(root, mapId, id)?.flags.map((f) => f.kind) ?? [];
const flagLog = (root: string, mapId: string) =>
  readFileSync(path.join(root, '.events/flags', `${mapId}.jsonl`), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as FlagEntry);

test('check states: re-runs replace older runs, missing required checks are UNKNOWN, only all-passed is a pass', () => {
  const clean = (s: string) => s;
  const runs = [
    { id: 1, name: 'test', status: 'completed', conclusion: 'failure' },
    { id: 2, name: 'test', status: 'completed', conclusion: 'success' },
    { id: 3, name: 'lint', status: 'in_progress', conclusion: null },
    { id: 4, name: 'e2e', status: 'queued', conclusion: null },
    { id: 5, name: 'old', status: 'completed', conclusion: 'cancelled' },
    { id: 6, name: 'odd', status: 'completed', conclusion: 'something_new' },
  ];
  assert.deepEqual(ids(foldChecks(runs, [], [], clean)), [
    'e2e:PENDING',
    'lint:RUNNING',
    'odd:UNKNOWN',
    'old:CANCELLED',
    'test:PASSED',
  ]);
  const req = foldChecks(runs.slice(0, 2), [{ context: 'ci/legacy', state: 'failure' }], ['test', 'deploy'], clean);
  assert.deepEqual(ids(req), ['ci/legacy:FAILED?', 'deploy:UNKNOWN', 'test:PASSED']);
  assert.equal(summarizeChecks(req), 'unknown', 'a required check with no result is not a pass');
  const s = (state: CiCheck['state']) => summarizeChecks([{ name: 'x', state, required: true }]);
  assert.deepEqual((['PASSED', 'PENDING', 'RUNNING', 'FAILED', 'CANCELLED', 'UNKNOWN'] as const).map(s), [
    'passed',
    'pending',
    'pending',
    'failing',
    'failing',
    'unknown',
  ]);
  assert.equal(summarizeChecks([]), 'none');
});

test('PR text is untrusted: control characters and markup stripped, length capped, tokens redacted', () => {
  assert.equal(untrusted('Fix\u0000 <script>bad</script>\n\n`rm -rf`  \u202eevil'), 'Fix scriptbad/script rm -rf evil');
  assert.equal(untrusted('x'.repeat(500)).length, 120);
  assert.equal(untrusted(`leak ${TOKEN}`), 'leak [redacted]');
  assert.equal(untrusted({ not: 'text' }), '');
  assert.deepEqual(bodyMarkers('Closes teamtrail:7#12. Also teamtrail:7#13 and teamtrail:7#12'), ['7#12', '7#13']);
  assert.deepEqual(bodyMarkers(null), []);
  assert.equal(branchRef('cursor/teamtrail-7-12'), '7#12');
  assert.equal(branchRef('teamtrail-7-12'), '7#12');
  assert.equal(branchRef('feature/teamtrail-7-12-extra/x'), undefined);
});

test('association by branch name, body marker, attempt branch and explicit link; forks need an explicit link', async () => {
  const { root, mapId, t, gh, tick } = await setup();
  gh.open(1, { sha: SHA_A, ref: `cursor/teamtrail-${mapId}-${t[0].id}` });
  gh.open(2, { sha: SHA_A, ref: 'some-branch', body: `Implements teamtrail:${mapId}#${t[1].id}` });
  gh.open(3, { sha: SHA_A, ref: 'evil', headRepo: 'mallory/launchpad', body: `teamtrail:${mapId}#${t[2].id}` });
  await tick();
  assert.equal(readTicketSync(root, mapId, t[0].id)?.link.source, 'marker');
  assert.equal(readTicketSync(root, mapId, t[0].id)?.pr?.number, 1);
  assert.equal(readTicketSync(root, mapId, t[1].id)?.pr?.number, 2);
  assert.equal(readTicketSync(root, mapId, t[2].id), undefined, 'a fork PR cannot link itself');

  gh.open(4, { sha: SHA_B, ref: 'agent/work' });
  const attempt: VerificationAttempt = {
    v: 1,
    id: 'A-1',
    mapId,
    ticketId: t[1].id,
    ticketKey: t[1].key,
    agent: 'claude-07',
    level: 'checks',
    configHash: 'none',
    submittedAt: 0,
    finishedAt: 0,
    resolution: 'done',
    checks: [],
    result: 'pass',
    git: gitOf('agent/work', SHA_B),
  };
  writeAttempt(root, attempt);
  await tick();
  const b = readTicketSync(root, mapId, t[1].id)!;
  assert.equal(b.link.source, 'branch', "the attempt's branch outranks a body marker");
  assert.equal(b.pr?.number, 4);

  const prev = readTicketSync(root, mapId, t[0].id)!;
  writeTicketSync(root, { ...prev, link: { number: 3, source: 'explicit', at: 0 } });
  await tick();
  assert.equal(readTicketSync(root, mapId, t[0].id)?.pr?.number, 3, 'a trail lead link wins and sticks');
  assert.equal(readTicketSync(root, mapId, t[0].id)?.pr?.sameRepo, false);
});

test('a PR named in report_completion links the ticket ahead of its branch; a newer attempt names a newer one', async () => {
  const { root, mapId, t, gh, tick } = await setup();
  gh.open(5, { sha: SHA_A, ref: 'agent/work' });
  gh.open(6, { sha: SHA_A, ref: 'elsewhere' });
  gh.open(7, { sha: SHA_B, ref: 'elsewhere-2' });
  const attempt = (id: string, pr: number): VerificationAttempt => ({
    v: 1,
    id,
    mapId,
    ticketId: t[2].id,
    ticketKey: t[2].key,
    agent: 'claude-07',
    level: 'checks',
    configHash: 'none',
    submittedAt: 0,
    finishedAt: 0,
    resolution: 'done',
    checks: [],
    result: 'fail',
    git: gitOf('agent/work', SHA_A),
    pr,
  });
  writeAttempt(root, attempt('A-1', 6));
  await tick();
  assert.deepEqual(
    [readTicketSync(root, mapId, t[2].id)?.link.source, readTicketSync(root, mapId, t[2].id)?.pr?.number],
    ['attempt', 6],
  );
  writeAttempt(root, attempt('A-2', 7));
  await tick();
  assert.equal(readTicketSync(root, mapId, t[2].id)?.pr?.number, 7);
});

test('mismatch flags are raised and cleared with events, and the ticket is never changed', async () => {
  const { root, a, mapId, t, gh, tick } = await setup();
  const ref = (i: number) => `teamtrail-${mapId}-${t[i].id}`;
  gh.open(1, { sha: SHA_A, ref: ref(0) });
  gh.check(SHA_A, 'test', 'completed', 'failure');
  await tick(['test']);
  assert.deepEqual(flags(root, mapId, t[0].id), ['required-checks-failing']);

  gh.check(SHA_A, 'test', 'completed', 'success');
  await a.close(mapId, t[0].id, 'completed');
  await tick(['test']);
  assert.deepEqual(flags(root, mapId, t[0].id), ['done-pr-open']);

  gh.update(1, { state: 'closed' });
  await tick(['test']);
  assert.deepEqual(flags(root, mapId, t[0].id), ['pr-closed-unmerged']);

  gh.open(2, { sha: SHA_B, ref: ref(1) });
  await a.assign(mapId, t[1].id, 'claude-07');
  gh.update(2, { state: 'closed', merged: true });
  await tick(['test']);
  assert.deepEqual(flags(root, mapId, t[1].id), ['pr-merged-not-done', 'checks-unknown']);

  const log = flagLog(root, mapId).map((e) => `${e.kind} ${e.flag}`);
  assert.deepEqual(log.slice(0, 4), [
    'flag.raised required-checks-failing',
    'flag.raised done-pr-open',
    'flag.cleared required-checks-failing',
    'flag.raised pr-closed-unmerged',
  ]);
  assert.ok(log.includes('flag.cleared done-pr-open'));
  const snap = await a.loadMap(mapId);
  assert.equal(snap.tickets[1].assignee, 'claude-07', 'the reconciler leaves the ticket as it is');
  assert.equal(snap.tickets[1].state, 'open');
  assert.ok(
    gh.requests.every((r) => r.method === 'GET'),
    'GitHub is only read',
  );
});

test('a PR head that differs from the verified commit is flagged', async () => {
  const { root, mapId, t, gh, tick } = await setup();
  gh.open(1, { sha: SHA_B, ref: `teamtrail-${mapId}-${t[0].id}` });
  gh.check(SHA_B, 'test', 'completed', 'success');
  const base = { v: 1 as const, mapId, ticketId: t[0].id, ticketKey: t[0].key, agent: 'a', level: 'checks' as const };
  const rest = { configHash: 'none', submittedAt: 0, finishedAt: 0, resolution: 'r', checks: [] };
  writeAttempt(root, { ...base, ...rest, id: 'A-1', result: 'pass', git: gitOf(null, SHA_A) });
  await tick();
  assert.deepEqual(flags(root, mapId, t[0].id), ['pr-head-not-verified']);
  writeAttempt(root, { ...base, ...rest, id: 'A-2', result: 'pass', git: gitOf(null, SHA_B) });
  await tick();
  assert.deepEqual(flags(root, mapId, t[0].id), []);
});

test('a failed read keeps the last snapshot and flags and marks the error; a rate limit aborts the tick', async () => {
  const { root, mapId, t, gh, tick } = await setup();
  gh.open(1, { sha: SHA_A, ref: `teamtrail-${mapId}-${t[0].id}` });
  gh.check(SHA_A, 'test', 'completed', 'failure');
  await tick();
  gh.fail(/\/pulls\/1$/);
  const r = await tick();
  assert.equal(r.failures.length, 1);
  const s = readTicketSync(root, mapId, t[0].id)!;
  assert.match(s.error ?? '', /500/);
  assert.deepEqual(
    s.flags.map((f) => f.kind),
    ['required-checks-failing'],
    'a failed sync does not clear flags',
  );
  gh.fail();
  await tick();
  assert.equal(readTicketSync(root, mapId, t[0].id)?.error, undefined);
  gh.rateLimit(3_600_000);
  await assert.rejects(tick(), (e: Error & { code?: string }) => e.code === 'rate_limited');
});

test('watchVerification: off without config, ok after a clean tick, failed (never ok) after an error, SSE event', async () => {
  const { root, a, mapId, t, gh, provider } = await setup();
  const events: VerificationSyncEvent[] = [];
  const send = (text: string) => events.push(JSON.parse(text.split('data: ')[1]));
  let access: () => Promise<GitHubCiProvider | string> = async () => provider;
  const w = watchVerification({ root, active: async () => a }, { access: () => access(), send }, { firstMs: 60_000 });
  const next = async () => {
    const n = events.length;
    w.kick();
    while (events.length === n) await new Promise((r) => setTimeout(r, 5));
    return events.at(-1)!;
  };
  try {
    assert.equal((await next()).status.state, 'off');
    assert.equal(existsSync(path.join(root, '.evidence')), false, 'nothing is written while sync is off');
    writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, github: { requiredChecks: ['test'] } }));
    approveAllHere(root);
    gh.open(1, { sha: SHA_A, ref: `teamtrail-${mapId}-${t[0].id}` });
    const ok = await next();
    assert.equal(ok.status.state, 'ok');
    assert.equal(ok.status.repo, gh.repo);
    assert.equal(ok.tickets[0].checksSummary, 'unknown');
    gh.fail(/\/pulls$/);
    const failed = await next();
    assert.equal(failed.status.state, 'failed');
    assert.equal(failed.status.lastOkAt, ok.status.lastOkAt);
    assert.equal(w.status().state, 'failed');
    access = async () => 'no GitHub token: run `gh auth login`';
    assert.match((await next()).status.reason ?? '', /no GitHub token/);
    gh.fail();
    access = async () => provider;
    gh.rateLimit(3_600_000);
    const limited = await next();
    assert.equal(limited.status.state, 'rate-limited');
    assert.ok(limited.status.nextAt! - limited.status.lastAttemptAt! >= 60_000);
  } finally {
    w.stop();
  }
  for (const r of gh.requests) assert.equal(r.auth, `Bearer ${TOKEN}`);
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) =>
      statSync(path.join(dir, n)).isDirectory() ? files(path.join(dir, n)) : [path.join(dir, n)],
    );
  for (const f of files(root)) assert.ok(!readFileSync(f, 'utf8').includes(TOKEN), `token leaked into ${f}`);
});

test('GET /verification/sync and PUT /verification/sync/link through the bridge', async () => {
  const root = tmp();
  const bridge = createTrackerBridge(root, {
    env: {},
    configDir: path.join(root, 'cfg'),
    reconciler: { firstMs: 60_000 },
  });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const put = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    fetch(`${base}/verification/sync/link`, { method: 'PUT', headers, body: JSON.stringify(body) });
  try {
    const md = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
    const { map, tickets } = await chartMap(md, {
      title: 'M',
      sections: SECTIONS,
      tickets: [{ ref: 'a', title: 'A', type: 'execute', body: '' }],
    });
    const empty = (await (await fetch(`${base}/verification/sync`)).json()) as { status: PrSyncStatus; tickets: [] };
    assert.equal(empty.status.state, 'off');
    assert.deepEqual(empty.tickets, []);
    assert.equal(
      (await put({ mapId: map.id, ticketId: tickets[0].id, pr: 5 }, { 'content-type': 'text/plain' })).status,
      403,
    );
    assert.equal((await put({ mapId: map.id, ticketId: tickets[0].id, pr: 'x' })).status, 400);
    assert.equal((await put({ mapId: map.id, ticketId: 'nope', pr: 5 })).status, 404);
    assert.equal((await put({ mapId: map.id, ticketId: tickets[0].id, pr: 5 })).status, 200);
    assert.equal(readTicketSyncs(root)[0].link.source, 'explicit');
    const listed = (await (await fetch(`${base}/verification/sync?mapId=${map.id}`)).json()) as { tickets: unknown[] };
    assert.equal(listed.tickets.length, 1);
    assert.equal((await put({ mapId: map.id, ticketId: tickets[0].id, pr: null })).status, 200);
    assert.deepEqual(readTicketSyncs(root), []);
  } finally {
    server.close();
    bridge.close();
  }
});

test('sync indicator: never shows success after a failed sync, and goes stale when ticks stop', () => {
  const now = Date.UTC(2026, 9, 31, 13, 0, 0);
  const ok: PrSyncStatus = {
    state: 'ok',
    repo: 'o/r',
    lastOkAt: now - 5000,
    lastAttemptAt: now - 5000,
    nextAt: now + 55_000,
  };
  assert.equal(prSyncView(ok, now).tone, 'ok');
  assert.equal(prSyncView({ ...ok, state: 'failed', lastAttemptAt: now - 1000 }, now).tone, 'failed');
  assert.equal(prSyncView({ ...ok, state: 'rate-limited' }, now).tone, 'failed');
  assert.equal(prSyncView({ ...ok, lastAttemptAt: now - 1000 }, now).tone, 'stale', 'ok must come from the last tick');
  assert.equal(prSyncView(ok, now + 10 * 60_000).tone, 'stale');
  assert.equal(prSyncView({ state: 'off', reason: 'no verification.json' }, now).tone, 'off');
  assert.equal(prSyncView(null, now).tone, 'unknown');
  assert.match(prSyncView({ ...ok, state: 'failed' }, now).title, /last ok 5s ago/);
});
