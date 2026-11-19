import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { trailChecksSource } from '../src/attention/sources/trailChecksSource';
import type { AttentionInput } from '../src/attention/types';
import { journalFile } from '../src/history/journalFile';
import type { MainRunEnv } from '../src/mainChecks/startMainRun';
import type { TrailRun } from '../src/model/trailChecks';
import type { MapSnapshot } from '../src/model/types';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { trailProofFor } from '../src/proof/trailProofFor';
import { trailProofMarkdown } from '../src/proof/trailProofMarkdown';
import { addFixTicket } from '../src/trailChecks/addFixTicket';
import { readTrailChecks } from '../src/trailChecks/readTrailChecks';
import { requestTrailRun } from '../src/trailChecks/requestTrailRun';
import { latestTrailRun } from '../src/trailChecks/trailRunStore';
import { trustKey, trustLedger } from '../src/trust/trustLedger';
import type { CheckRunner, MainRunJob } from '../src/verification/checkRunner';
import { writeAttempt } from '../src/verification/evidenceStore';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
/** Fails once a.txt and b.txt are both on main: each branch passes alone, the two together break. */
const CHECK = `const fs = require('fs');
if (fs.existsSync('a.txt') && fs.existsSync('b.txt')) { console.log('FAIL a and b clash'); process.exit(1); }
console.log('ok');`;

let repo: string;
let root: string;
let adapter: MarkdownAdapter;
const env = (): MainRunEnv => ({ root });
const git = (...a: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' })
    .toString()
    .trim();

before(() => {
  repo = path.join(tempFolder('teamtrail-trail-checks-'), 'app');
  root = path.join(repo, '.teamtrail');
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(repo, '.gitignore'), '.teamtrail\n');
  writeFileSync(path.join(repo, 'check.js'), CHECK);
  const checks = { test: { run: [process.execPath, 'check.js'] } };
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, checks, run: ['test'] }));
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  approveAllHere(root);
  adapter = new MarkdownAdapter(nodeMarkdownFs(root), root);
});

/** A trail of execute tickets, each done on its own branch adding `file`, with a passing attempt on that commit. */
async function doneTrail(files: string[]): Promise<MapSnapshot> {
  const charted = await chartMap(adapter, {
    title: `Trail ${files.join(' ')}`,
    sections: SECTIONS,
    verification: 'checks',
    tickets: files.map((f) => ({ ref: f, title: `Add ${f}`, type: 'execute' as const, body: '' })),
  });
  const mapId = charted.map.id;
  trustLedger(root).set({ [trustKey.discoverySkipped(mapId)]: { hash: 't', at: 1, by: 'trail lead', content: '' } });
  const snap = await adapter.loadMap(mapId);
  for (const [i, t] of snap.tickets.entries()) {
    const branch = `${mapId}-${t.id}`;
    git('checkout', '-qb', branch, 'main');
    writeFileSync(path.join(repo, files[i]), files[i]);
    git('add', files[i]);
    git('commit', '-qm', `add ${files[i]}`);
    const head = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main');
    writeAttempt(root, attempt(mapId, t.id, head));
    await adapter.close(mapId, t.id, 'completed');
  }
  return adapter.loadMap(mapId);
}

function attempt(mapId: string, ticketId: string, head: string): VerificationAttempt {
  return {
    v: 1,
    id: 'A-1',
    mapId,
    ticketId,
    ticketKey: ticketId,
    agent: 'claude-01',
    level: 'checks',
    configHash: 'x',
    submittedAt: 1,
    finishedAt: 2,
    resolution: 'done',
    checks: [],
    result: 'pass',
    git: {
      v: 1,
      tree: { toplevel: repo, head, branch: 'x', detached: false, gitDir: '' } as never,
      changed: [],
      stats: { files: 1, add: 1, del: 0 },
      flags: [],
    },
  };
}

const merge = (snap: MapSnapshot, id: string) => git('merge', '-q', '--no-ff', '-m', 'merge', `${snap.map.id}-${id}`);

async function settled(mapId: string): Promise<TrailRun> {
  for (let i = 0; i < 200; i++) {
    const run = latestTrailRun(root, mapId);
    if (run && run.result !== 'running') return run;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the run did not finish');
}

test('waits for the merges, runs once when they are on main, and verifies the trail together', async () => {
  const snap = await doneTrail(['a.txt']);
  const waiting = await readTrailChecks(env(), snap, { trigger: 'Teamtrail' });
  assert.equal(waiting.state.kind, 'waiting');
  const key = snap.tickets[0].key;
  assert.equal((waiting.state as { reason: string }).reason, `${key} is not in main on this machine yet: pull main.`);
  assert.equal(waiting.together.kind, 'pending');
  assert.equal(latestTrailRun(root, snap.map.id), undefined);

  merge(snap, snap.tickets[0].id);
  const started = await readTrailChecks(env(), snap, { trigger: 'Teamtrail' });
  assert.equal(started.state.kind, 'running');
  const run = await settled(snap.map.id);
  assert.equal(run.result, 'pass');
  assert.equal(run.commit, git('rev-parse', 'HEAD'));
  assert.equal(run.complete, true);
  assert.deepEqual(
    run.merges.map((m) => [m.key, m.state, m.contained]),
    [[key, 'merged', true]],
  );

  const view = await readTrailChecks(env(), snap, { trigger: 'Teamtrail' });
  assert.equal(view.state.kind, 'passed');
  assert.equal(view.run?.id, run.id, 'the same merges never run again by themselves');
  assert.deepEqual(view.together, { kind: 'passed', commit: run.commit, branch: 'main', runId: run.id });
  const journaled = journalFile(root).readTrailChecks(snap.map.id);
  assert.deepEqual(
    journaled.map((e) => [e.action, e.actor, e.result ?? null]),
    [
      ['run', 'Teamtrail', null],
      ['result', 'Teamtrail', 'pass'],
    ],
  );

  const proof = await trailProofFor({ env: env(), snap, decisions: [] });
  assert.equal(proof.kind, 'trail');
  assert.equal(proof.together?.result, 'pass');
  assert.ok(!proof.gaps.some((g) => g.startsWith('Not verified together')), proof.gaps.join('\n'));
  assert.match(trailProofMarkdown(proof), /passed on main at/);
});

test('a failing run together raises an item, takes a fix ticket once, and the trail waits for it', async () => {
  const snap = await doneTrail(['b.txt']);
  merge(snap, snap.tickets[0].id);
  await readTrailChecks(env(), snap, { trigger: 'Teamtrail' });
  const run = await settled(snap.map.id);
  assert.equal(run.result, 'fail', 'a.txt from the first trail and b.txt together break the check');
  const view = await readTrailChecks(env(), snap, { trigger: 'Teamtrail' });
  assert.deepEqual(view.state, { kind: 'failed', failing: ['test'] });
  assert.equal(view.together.kind, 'failed');
  assert.equal(view.run?.id, run.id, 'a failed run is not started again by itself');

  const items = trailChecksSource.collect({ trailChecks: [view] } as AttentionInput);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, `Trail checks fail on main after merging ${snap.tickets[0].key}`);

  const fix = await addFixTicket({ root, adapter, mapId: snap.map.id, runId: run.id, by: 'trail lead' });
  const again = await addFixTicket({ root, adapter, mapId: snap.map.id, runId: run.id, by: 'trail lead' });
  assert.equal(again.id, fix.id, 'asking twice gives the same ticket');
  assert.match(fix.body, /FAIL a and b clash/);
  const after = await readTrailChecks(env(), await adapter.loadMap(snap.map.id));
  assert.equal(after.state.kind, 'waiting');
  assert.equal(trailChecksSource.collect({ trailChecks: [after] } as AttentionInput).length, 0);
  const actions = journalFile(root)
    .readTrailChecks(snap.map.id)
    .map((e) => e.action);
  assert.deepEqual(actions, ['run', 'result', 'fix-ticket']);
});

test("Run now before everything is merged runs on main as it is and doesn't verify the trail", async () => {
  const snap = await doneTrail(['c.txt']);
  const start = requestTrailRun(env(), snap);
  assert.equal(start.kind, 'started');
  const run = await settled(snap.map.id);
  assert.equal(run.complete, false);
  assert.equal(run.by, 'trail lead');
  const view = await readTrailChecks(env(), snap);
  assert.equal(view.state.kind, 'waiting', 'a run without every merge is no verdict on the trail');
  assert.equal(view.run?.id, run.id);
  assert.equal(view.together.kind, 'pending');
});

/** A runner that passes every check, on the commit `ranOn` says (by default the one it was asked for, else `f…`). */
function cloudRunner(jobs: MainRunJob[], ranOn = (job: MainRunJob) => job.commit ?? 'f'.repeat(40)): CheckRunner {
  return {
    name: 'cloud',
    run: async () => ({ checks: [] }),
    runMain: async (job) => {
      jobs.push(job);
      const checks = job.checks.map((c) => ({
        name: c.name,
        exitCode: 0,
        timedOut: false,
        durationMs: 5,
        output: 'ok',
      }));
      const head = ranOn(job);
      return { checks, git: { head, branch: 'main', base: { head: null, branch: null }, changed: [] } };
    },
  };
}

test('with a runner, the run goes to it on the exact commit named here, and only the merges it says it holds count', async () => {
  const snap = await doneTrail(['d.txt']);
  merge(snap, snap.tickets[0].id);
  const jobs: MainRunJob[] = [];
  await readTrailChecks({ root, checkRunner: cloudRunner(jobs) }, snap, { trigger: 'Teamtrail' });
  const run = await settled(snap.map.id);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].commit, git('rev-parse', 'main'), 'main here holds every merge: that commit is named');
  assert.deepEqual(jobs[0].contains, [run.merges[0].commit]);
  assert.equal(run.runner, 'cloud');
  assert.equal(run.result, 'pass');
  assert.equal(run.commit, jobs[0].commit);
  assert.equal(run.complete, false, 'the runner listed no merge as contained');
});

test("a runner's report on another commit than the one named counts as couldn't run", async () => {
  const snap = await doneTrail(['e.txt']);
  merge(snap, snap.tickets[0].id);
  const jobs: MainRunJob[] = [];
  await readTrailChecks({ root, checkRunner: cloudRunner(jobs, () => 'f'.repeat(40)) }, snap, { trigger: 'Teamtrail' });
  const run = await settled(snap.map.id);
  assert.equal(run.result, 'unavailable');
  assert.match(String(run.note), /^cloud ran on fffffff, not [0-9a-f]{7} as asked$/);
  assert.deepEqual(run.checks, []);
});

test("merges main here doesn't hold yet name no commit: the runner takes its default branch's head", async () => {
  const snap = await doneTrail(['g.txt']);
  const jobs: MainRunJob[] = [];
  await readTrailChecks({ root, checkRunner: cloudRunner(jobs) }, snap, { trigger: 'Teamtrail' });
  const run = await settled(snap.map.id);
  assert.equal(jobs[0].commit, undefined);
  assert.equal(run.result, 'pass');
  assert.equal(run.commit, 'f'.repeat(40));
});

test('a runner whose server holds no checkout names no commit, even when main here holds every merge', async () => {
  const snap = await doneTrail(['h.txt']);
  merge(snap, snap.tickets[0].id);
  const jobs: MainRunJob[] = [];
  const runner = { ...cloudRunner(jobs), holdsCode: false };
  await readTrailChecks({ root, checkRunner: runner }, snap, { trigger: 'Teamtrail' });
  const run = await settled(snap.map.id);
  assert.equal(jobs[0].commit, undefined, "this folder's git is not the work's");
  assert.equal(jobs[0].branch, undefined);
  assert.deepEqual(jobs[0].contains, [run.merges[0].commit], 'the runner still says which merges it holds');
  assert.equal(run.commit, 'f'.repeat(40));
});
