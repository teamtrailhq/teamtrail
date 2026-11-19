import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { GitHubCiProvider } from '../src/evidence/github/GitHubCiProvider';
import { reconcile } from '../src/evidence/reconcile';
import { readTicketSync } from '../src/evidence/syncStore';
import { journalFile } from '../src/history/journalFile';
import type { PrChoice, TicketSync } from '../src/model/prEvidence';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';
import { handleVerificationSync } from '../src/server/verificationSyncRoutes';
import type { VerificationWatch } from '../src/server/watchVerification';
import { writeAttempt } from '../src/verification/evidenceStore';
import { fakeGitHubPulls } from './fakes/githubPulls';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const dirs: string[] = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A trail with one ticket whose latest attempt ran on `feat/x`, the fake GitHub, and the route on a real server. */
async function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-handlink-'));
  dirs.push(root);
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(a, {
    title: 'Hand links',
    sections: SECTIONS,
    tickets: [{ ref: 'a', title: 'Checkout', type: 'execute', body: '' }],
  });
  const t = tickets[0];
  const git = { v: 1, tree: { toplevel: '/r', head: SHA_A, branch: 'feat/x', fingerprint: 'sha256:0' } };
  writeAttempt(root, {
    ...{ v: 1, id: 'A-1', mapId: map.id, ticketId: t.id, ticketKey: t.key, agent: 'claude-01', level: 'checks' },
    ...{ configHash: 'h', submittedAt: 1, finishedAt: 2, resolution: 'done', checks: [], result: 'pass' },
    git: { ...git, changed: [], stats: { files: 1, add: 1, del: 0 }, flags: [] } as VerificationAttempt['git'],
  });
  const gh = fakeGitHubPulls();
  const provider = new GitHubCiProvider({ repo: gh.repo, token: 'ghp_fake', fetch: gh.fetch, sleep: async () => {} });
  let kicks = 0;
  const watch: VerificationWatch = { status: () => ({ state: 'ok' }), stop() {}, kick: () => void kicks++ };
  const ctx = { root, active: async () => a, watch, access: async () => provider };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    void handleVerificationSync(ctx, req, res, url).catch((e) => {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: String(e?.message ?? e) }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const put = async (pr: number | null) => {
    const body = JSON.stringify({ mapId: map.id, ticketId: t.id, pr });
    const r = await fetch(`${base}/verification/sync/link`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    });
    return { status: r.status, body: (await r.json()) as { ticket?: TicketSync | null; error?: string } };
  };
  const choices = async () =>
    (await (await fetch(`${base}/verification/sync/candidates?mapId=${map.id}&ticketId=${t.id}`)).json()) as {
      repo: string;
      prs: PrChoice[];
    };
  let clock = Date.UTC(2026, 10, 19, 12, 0, 0);
  const tick = () => reconcile({ root, adapter: a, provider, requiredChecks: [], now: () => (clock += 60_000) });
  const sync = () => readTicketSync(root, map.id, t.id);
  return { root, mapId: map.id, t, gh, put, choices, tick, sync, kicks: () => kicks };
}

test('the routes that read with the token or decide where a proof goes answer this machine only', () => {
  assert.equal(thisMachineOnly('PUT', '/verification/sync/link'), true);
  assert.equal(thisMachineOnly('GET', '/verification/sync/candidates'), true);
  assert.equal(thisMachineOnly('GET', '/verification/sync'), false);
});

test('candidates: the ticket’s own pull requests first, then open, merged and closed, newest first', async () => {
  const s = await setup();
  s.gh.open(1, { sha: SHA_A, ref: 'other' });
  s.gh.open(2, { sha: SHA_A, ref: 'feat/x', state: 'closed' });
  s.gh.open(3, { sha: SHA_B, ref: 'another', state: 'closed', merged: true });
  s.gh.open(4, { sha: SHA_B, ref: 'feat/x' });
  const r = await s.choices();
  assert.equal(r.repo, s.gh.repo);
  assert.deepEqual(
    r.prs.map((p) => [p.number, p.forTicket]),
    [
      [4, true],
      [2, true],
      [1, false],
      [3, false],
    ],
  );
});

test('a hand link is checked with GitHub, shown at once, journaled, and never moved by the reconciler', async () => {
  const s = await setup();
  s.gh.open(7, { sha: SHA_A, ref: 'feat/x' });
  await s.tick();
  assert.equal(s.sync()?.link.number, 7, 'found by its branch first');

  const missing = await s.put(99);
  assert.equal(missing.status, 400);
  assert.match(missing.body.error!, /no pull request #99/);
  assert.equal(s.sync()?.link.number, 7, 'a refused link changes nothing');

  s.gh.open(12, { sha: SHA_B, ref: 'elsewhere', title: 'The real one' });
  const ok = await s.put(12);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ticket?.link.source, 'explicit');
  assert.equal(ok.body.ticket?.pr?.title, 'The real one', 'the reply carries the PR as GitHub has it');
  assert.equal(s.kicks(), 1, 'the reconciler runs next');

  // the branch's PR gets a newer push, and the hand-linked one closes: the link stays
  s.gh.update(7, { sha: SHA_B });
  s.gh.update(12, { state: 'closed' });
  await s.tick();
  await s.tick();
  assert.equal(s.sync()?.link.number, 12);
  assert.equal(s.sync()?.pr?.state, 'closed');

  const log = journalFile(s.root).readPrLinks(s.mapId);
  assert.deepEqual(
    log.map((e) => [e.action, e.pr, e.was, e.actorKind]),
    [['linked', 12, 7, 'trail lead']],
  );
  assert.deepEqual(journalFile(s.root).read(s.mapId), [], 'transitions readers skip the new kind');
});

test('an unlinked PR is never linked again by its branch; a hand link brings it back', async () => {
  const s = await setup();
  s.gh.open(7, { sha: SHA_A, ref: 'feat/x' });
  await s.tick();
  assert.equal(s.sync()?.link.number, 7);

  const gone = await s.put(null);
  assert.equal(gone.status, 200);
  assert.equal(gone.body.ticket, null);
  await s.tick();
  await s.tick();
  assert.equal(s.sync(), undefined, 'the branch does not link it again');

  s.gh.open(8, { sha: SHA_B, ref: 'feat/x' });
  await s.tick();
  assert.equal(s.sync()?.link.number, 8, 'a new PR on the branch still links');

  assert.equal((await s.put(7)).status, 200);
  await s.tick();
  assert.equal(s.sync()?.link.number, 7);
  assert.deepEqual(
    journalFile(s.root)
      .readPrLinks(s.mapId)
      .map((e) => [e.action, e.pr]),
    [
      ['unlinked', 7],
      ['linked', 7],
    ],
  );
});
