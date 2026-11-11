import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { baselineForClaim, captureBaseline } from '../src/evidence/baseline';
import { collectEvidence } from '../src/evidence/collectEvidence';
import { flagEffect } from '../src/evidence/flags';
import { staleness } from '../src/evidence/stale';
import type { GitEvidence } from '../src/model/evidence';
import type { TicketType } from '../src/model/types';
import { chartMap } from '../src/planning/operations/chart';
import { DEFAULT_CONFIG } from '../src/verification/config';
import { readVerificationConfig } from '../src/verification/configFile';
import { readAttempts } from '../src/verification/evidenceStore';
import { verify } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

function sh(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** A temp repo with one commit and its tracker folder at `.teamtrail/`. */
function repo() {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-git-')));
  sh(dir, 'init', '-q', '-b', 'main');
  sh(dir, 'config', 'user.email', 't@example.com');
  sh(dir, 'config', 'user.name', 'T');
  sh(dir, 'config', 'commit.gpgsign', 'false');
  write(dir, 'a.txt', 'one\ntwo\n');
  write(dir, 'b.txt', 'b\n');
  sh(dir, 'add', '.');
  sh(dir, 'commit', '-q', '-m', 'init');
  const root = path.join(dir, '.teamtrail');
  mkdirSync(root);
  return { dir, root };
}

function write(dir: string, file: string, text: string) {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
}

function commit(dir: string, msg = 'c') {
  sh(dir, 'add', '-A', '--', '.', ':(exclude).teamtrail');
  sh(dir, 'commit', '-q', '-m', msg);
}

async function trail(types: TicketType[] = ['execute', 'execute']) {
  const a = new MemoryAdapter({ latency: [0, 0] });
  const { map, tickets } = await chartMap(a, {
    title: 'G',
    sections: SECTIONS,
    tickets: types.map((type, i) => ({ ref: `t${i}`, title: `T${i}`, type, body: '' })),
  });
  return { a, mapId: map.id, tickets };
}

async function claimAndCollect(
  r: { dir: string; root: string },
  work: () => void,
  opts: { type?: TicketType; noCodeReason?: string; noChanges?: typeof DEFAULT_CONFIG.noChanges } = {},
) {
  const { a, mapId, tickets } = await trail([opts.type ?? 'execute']);
  const t = tickets[0];
  await a.assign(mapId, t.id, 'claude-07');
  await captureBaseline({ root: r.root, cwd: r.dir, mapId, ticket: t, agent: 'claude-07' });
  work();
  return collectEvidence({
    root: r.root,
    cwd: r.dir,
    snap: await a.loadMap(mapId),
    ticket: t,
    config: { ...DEFAULT_CONFIG, noChanges: opts.noChanges ?? DEFAULT_CONFIG.noChanges },
    configHash: readVerificationConfig(r.root).hash,
    noCodeReason: opts.noCodeReason,
  });
}

const kinds = (ev: GitEvidence) => ev.flags.map((f) => f.kind);

test('outside git: the baseline records why, evidence flags no-git, stale detection is off', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-nogit-'));
  const b = await captureBaseline({ root, cwd: root, mapId: 'm', ticket: { id: '1', key: '#1' }, agent: 'x' });
  assert.equal(b.git, null);
  assert.match(b.note ?? '', /not inside a git repository/);
  const ev = await claimAndCollect({ dir: root, root }, () => {});
  assert.deepEqual(kinds(ev), ['no-git']);
  assert.equal(ev.tree, undefined);
  assert.deepEqual(await staleness(root, ev), { checked: false, stale: false });
});

test('changes since a clean baseline: edits, new files, commits; the tracker folder is left out', async () => {
  const r = repo();
  const ev = await claimAndCollect(r, () => {
    write(r.dir, 'a.txt', 'one\nTWO\nthree\n');
    commit(r.dir);
    write(r.dir, 'new/c.txt', 'x\ny\n');
    rmSync(path.join(r.dir, 'b.txt'));
    write(r.root, 'notes.md', 'tracker edits are not code');
  });
  assert.deepEqual(ev.changed, [
    { path: 'a.txt', add: 2, del: 1 },
    { path: 'b.txt', add: 0, del: 1 },
    { path: 'new/c.txt', add: 2, del: 0, untracked: true },
  ]);
  assert.deepEqual(ev.stats, { files: 3, add: 4, del: 2 });
  assert.deepEqual(kinds(ev), []);
  assert.equal(ev.tree?.branch, 'main');
  assert.notEqual(ev.tree?.head, ev.base?.head);
});

test('files dirty at claim are subtracted unless edited again', async () => {
  const r = repo();
  write(r.dir, 'a.txt', 'already dirty\n');
  write(r.dir, 'b.txt', 'dirty too\n');
  write(r.dir, 'scratch.txt', 'untracked before\n');
  const ev = await claimAndCollect(r, () => write(r.dir, 'b.txt', 'edited during the ticket\n'));
  assert.deepEqual(
    ev.changed.map((c) => [c.path, c.dirtyAtClaim ?? false]),
    [['b.txt', true]],
  );
});

test('no changes: flagged, allowed for decision tickets or with a reason, failing or blocking by policy', async () => {
  const r = repo();
  const plain = await claimAndCollect(r, () => {});
  assert.deepEqual(
    plain.flags.map((f) => [f.kind, f.level, f.effect]),
    [['no-changes', 'warn', undefined]],
  );
  assert.equal((await claimAndCollect(r, () => {}, { type: 'research' })).flags[0].level, 'info');
  assert.equal((await claimAndCollect(r, () => {}, { noCodeReason: 'docs live elsewhere' })).flags[0].level, 'info');
  const fail = await claimAndCollect(r, () => {}, { noChanges: { allow: [], else: 'fail' } });
  assert.equal(flagEffect(fail.flags)?.effect, 'fail');
  const human = await claimAndCollect(r, () => {}, { noChanges: { allow: [], else: 'human' } });
  assert.equal(flagEffect(human.flags)?.effect, 'human');
});

test('branch switch: info when the new head descends from the base, alert after a reset; same-branch rewrite', async () => {
  const r = repo();
  const ahead = await claimAndCollect(r, () => {
    sh(r.dir, 'checkout', '-q', '-b', 'feature');
    write(r.dir, 'a.txt', 'x\n');
    commit(r.dir);
  });
  assert.deepEqual(
    ahead.flags.map((f) => [f.kind, f.level]),
    [['branch-switch', 'info']],
  );

  const r2 = repo();
  const reset = await claimAndCollect(r2, () => {
    sh(r2.dir, 'checkout', '-q', '--orphan', 'other');
    write(r2.dir, 'a.txt', 'rewritten\n');
    commit(r2.dir, 'unrelated');
  });
  assert.deepEqual(
    reset.flags.map((f) => [f.kind, f.level]),
    [['branch-switch', 'alert']],
  );

  const r3 = repo();
  write(r3.dir, 'a.txt', 'two\n');
  commit(r3.dir);
  const rewritten = await claimAndCollect(r3, () => {
    sh(r3.dir, 'reset', '-q', '--hard', 'HEAD~1');
    write(r3.dir, 'b.txt', 'changed\n');
  });
  assert.deepEqual(
    rewritten.flags.map((f) => [f.kind, f.level]),
    [['history-rewritten', 'alert']],
  );
});

test('editing verification.json during a ticket sends it to a human', async () => {
  const r = repo();
  write(r.root, 'verification.json', '{"v":1}');
  const ev = await claimAndCollect(r, () => {
    write(r.root, 'verification.json', '{"v":1,"run":[]}');
    write(r.dir, 'a.txt', 'x\n');
  });
  assert.deepEqual(kinds(ev), ['config-changed']);
  assert.equal(flagEffect(ev.flags)?.effect, 'human');
});

test('overlap with another working ticket: a real overlap across worktrees, approximate in a shared one', async () => {
  const r = repo();
  const other = path.join(path.dirname(r.dir), `${path.basename(r.dir)}-wt`);
  sh(r.dir, 'worktree', 'add', '-q', '-b', 'side', other);
  const { a, mapId, tickets } = await trail();
  const [mine, theirs] = tickets;
  await a.assign(mapId, mine.id, 'claude-07');
  await a.assign(mapId, theirs.id, 'codex-02');
  await captureBaseline({ root: r.root, cwd: r.dir, mapId, ticket: mine, agent: 'claude-07' });
  await captureBaseline({ root: r.root, cwd: other, mapId, ticket: theirs, agent: 'codex-02' });
  write(r.dir, 'a.txt', 'mine\n');
  write(other, 'a.txt', 'theirs\n');
  const collect = async () =>
    collectEvidence({ root: r.root, cwd: r.dir, snap: await a.loadMap(mapId), ticket: mine, configHash: undefined });
  const ev = await collect();
  assert.deepEqual(
    ev.flags.map((f) => [f.kind, f.files, f.tickets]),
    [['overlap', ['a.txt'], [theirs.key]]],
  );

  await captureBaseline({ root: r.root, cwd: r.dir, mapId, ticket: theirs, agent: 'codex-02' });
  write(r.dir, 'a.txt', 'mine again\n');
  assert.deepEqual(kinds(await collect()), ['shared-worktree']);
});

test('stale fingerprints: unchanged code is fresh; an edit, a commit or a config change makes it stale', async () => {
  const r = repo();
  const ev = await claimAndCollect(r, () => write(r.dir, 'a.txt', 'x\n'));
  assert.deepEqual(await staleness(r.root, ev), { checked: true, stale: false });
  write(r.root, 'evidence-like.json', '{}');
  assert.equal((await staleness(r.root, ev)).stale, false, 'tracker files do not count');
  write(r.dir, 'a.txt', 'y\n');
  assert.match((await staleness(r.root, ev)).reason ?? '', /uncommitted changes/);
  commit(r.dir);
  assert.match((await staleness(r.root, ev)).reason ?? '', /HEAD moved/);
  write(r.root, 'verification.json', '{"v":1}');
  assert.doesNotMatch(
    (await staleness(r.root, ev)).reason ?? '',
    /verification.json/,
    'an unapproved edit counts for nothing',
  );
  approveAllHere(r.root);
  assert.match((await staleness(r.root, ev)).reason ?? '', /verification.json/, 'once approved, the config changed');
});

test('a resumed claim keeps its baseline; a fresh claim takes a new one', async () => {
  const r = repo();
  const c = { root: r.root, cwd: r.dir, mapId: 'm', ticket: { id: '1', key: '#1' }, agent: 'x' };
  const first = await baselineForClaim({ ...c, resume: false });
  assert.equal((await baselineForClaim({ ...c, resume: true })).id, first.id);
  assert.notEqual((await baselineForClaim({ ...c, resume: false })).id, first.id);
});

const node = process.execPath;

async function verifying(r: { dir: string; root: string }, checkRun: string[], stale: 'reverify' | 'flag') {
  write(
    r.root,
    'verification.json',
    JSON.stringify({ v: 1, checks: { gen: { run: checkRun, timeoutSec: 30 } }, run: ['gen'], stale }),
  );
  approveAllHere(r.root);
  const { a, mapId, tickets } = await trail();
  const t = tickets[0];
  await a.assign(mapId, t.id, 'claude-07');
  await captureBaseline({ root: r.root, cwd: r.dir, mapId, ticket: t, agent: 'claude-07' });
  write(r.dir, 'a.txt', 'work\n');
  await a.setMeta(mapId, t.id, { status: 'verifying' });
  const snap = await a.loadMap(mapId);
  const env = { adapter: a, root: r.root, repoRoot: r.dir };
  const info = { level: 'checks' as const, source: 'trail' as const, checks: ['gen'] };
  const run = await verify(env, {
    mapId,
    ticket: snap.tickets.find((x) => x.id === t.id)!,
    info,
    sub: {
      agent: 'claude-07',
      resolution: 'done',
    },
  });
  return { a, mapId, t, settled: await run.done };
}

test('verify: the attempt carries git evidence, and the ticket comment shows it', async () => {
  const r = repo();
  const { a, mapId, t, settled } = await verifying(r, [node, '-e', ''], 'reverify');
  assert.equal(settled.phase, 'done');
  assert.deepEqual(
    settled.attempt.git?.changed.map((c) => c.path),
    ['a.txt'],
  );
  const comments = (await a.loadMap(mapId)).tickets.find((x) => x.id === t.id)!.comments;
  assert.ok(comments.some((c) => /Git: 1 file changed \(\+1 −2\)/.test(c.body)));
});

test('verify: a pass on code that changed while checks ran is re-run once under reverify', async () => {
  const r = repo();
  const gen = [node, '-e', "require('fs').writeFileSync('gen.txt', String(Math.random()))"];
  const { mapId, t, settled } = await verifying(r, gen, 'reverify');
  const attempts = readAttempts(r.root, mapId, t.id);
  assert.equal(attempts.length, 2);
  assert.ok(attempts.every((x) => x.git?.flags.some((f) => f.kind === 'stale')));
  assert.equal(settled.attempt.id, 'A-2');
  assert.equal(settled.phase, 'done');

  const r2 = repo();
  const flagged = await verifying(r2, gen, 'flag');
  assert.equal(readAttempts(r2.root, flagged.mapId, flagged.t.id).length, 1);
});

test('verify: verification.json edited since the claim blocks the ticket without running checks', async () => {
  const r = repo();
  write(r.root, 'verification.json', '{"v":1}');
  const { a, mapId, tickets } = await trail();
  const t = tickets[0];
  await a.assign(mapId, t.id, 'claude-07');
  await captureBaseline({ root: r.root, cwd: r.dir, mapId, ticket: t, agent: 'claude-07' });
  write(r.dir, 'a.txt', 'work\n');
  write(
    r.root,
    'verification.json',
    JSON.stringify({ v: 1, checks: { ok: { run: [node, '-e', ''], timeoutSec: 30 } }, run: ['ok'] }),
  );
  // approved by the trail lead on this machine; the edit since the claim still sends the ticket to them
  approveAllHere(r.root);
  await a.setMeta(mapId, t.id, { status: 'verifying' });
  const snap = await a.loadMap(mapId);
  const run = await verify(
    { adapter: a, root: r.root, repoRoot: r.dir },
    {
      mapId,
      ticket: snap.tickets.find((x) => x.id === t.id)!,
      info: { level: 'checks', source: 'trail', checks: ['ok'] },
      sub: { agent: 'claude-07', resolution: 'done' },
    },
  );
  const s = await run.done;
  assert.equal(s.phase, 'blocked');
  assert.equal(s.attempt.result, 'error');
  assert.deepEqual(s.attempt.checks, []);
  assert.match(s.attempt.note ?? '', /verification.json changed/);
});
