import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { mainChecksSource } from '../src/attention/sources/mainChecksSource';
import type { AttentionInput } from '../src/attention/types';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { journalFile } from '../src/history/journalFile';
import { chooseMain } from '../src/mainChecks/chooseMain';
import { MAIN_WORKTREE_KEY } from '../src/mainChecks/mainWorktree';
import { readMainChecks } from '../src/mainChecks/readMainChecks';
import { requestMainRun } from '../src/mainChecks/requestMainRun';
import { trailKnownFailures, withKnownFailures } from '../src/mainChecks/withKnownFailures';
import type { MainChecksView } from '../src/model/mainChecks';
import type { CheckResult } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { proofGaps } from '../src/proof/proofGaps';
import { trustKey, trustLedger } from '../src/trust/trustLedger';
import type { CheckRunner } from '../src/verification/checkRunner';
import { levelFor } from '../src/verification/verifyCompletion';
import { preparedWorktree } from '../src/workspaces/trustedWorkspace';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
/** `test` fails on main until title.txt exists, printing a failure line like a test runner's. */
const CHECK = `const fs = require('fs');
if (!fs.existsSync('title.txt')) { console.log('FAIL src/App.test.tsx > should render title (' + process.cwd() + ')'); process.exit(1); }
if (fs.existsSync('broken.txt')) { console.log('FAIL src/Other.test.tsx > breaks something else'); process.exit(1); }
console.log('ok');`;

let repo: string;
let root: string;
let mapId: string;
let adapter: MarkdownAdapter;
const env = () => ({ root });
const git = (...a: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' });

before(async () => {
  repo = path.join(tempFolder('teamtrail-main-checks-'), 'app');
  root = path.join(repo, '.teamtrail');
  mkdirSync(root, { recursive: true });
  mkdirSync(path.join(repo, 'node_modules', 'dep'), { recursive: true });
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n.teamtrail\n');
  writeFileSync(path.join(repo, 'check.js'), CHECK);
  // the linked dependency folder is there for the check, as in the repo
  writeFileSync(path.join(repo, 'deps.js'), "require('fs').statSync('node_modules/dep');");
  const node = process.execPath;
  const checks = { lint: { run: [node, 'deps.js'] }, test: { run: [node, 'check.js'] } };
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, checks, run: ['lint', 'test'] }));
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  approveAllHere(root);
  adapter = new MarkdownAdapter(nodeMarkdownFs(root), root);
  const charted = await chartMap(adapter, {
    title: 'Title',
    sections: SECTIONS,
    verification: 'checks',
    tickets: [{ ref: 'a', title: 'Render the title', type: 'execute', body: '' }],
  });
  mapId = charted.map.id;
  const skipped = { hash: 'test', at: Date.now(), by: 'trail lead', content: '' };
  trustLedger(root).set({ [trustKey.discoverySkipped(mapId)]: skipped });
});

const read = (o: { trigger?: string } = {}) => readMainChecks(env(), mapId, { ...o, waitMs: 20_000 });

test('a trail ready for work runs the approved checks on main once, in a worktree it removes again', async () => {
  const view = await read({ trigger: 'agent claude-01' });
  assert.equal(view.run?.result, 'fail');
  assert.equal(view.run?.commit, git('rev-parse', 'HEAD').toString().trim());
  assert.equal(view.run?.branch, 'main');
  assert.deepEqual(
    view.run?.checks.map((c) => [c.name, c.passed]),
    [
      ['lint', true],
      ['test', false],
    ],
  );
  assert.deepEqual(view.state, { kind: 'failed', failing: ['test'], fixing: false });
  assert.equal(view.holds, true);
  assert.match(view.reason ?? '', /already fail on main \(test\)/);
  // the worktree is gone, from disk and from this machine's record; the repo's own node_modules is untouched
  assert.equal(preparedWorktree(root, MAIN_WORKTREE_KEY, view.run!.id), undefined);
  const sibling = path.join(path.dirname(repo), 'app.teamtrail');
  assert.deepEqual(existsSync(sibling) ? readdirSync(sibling) : [], []);
  assert.ok(existsSync(path.join(repo, 'node_modules', 'dep')));
  // asking again reuses the run: nothing new starts
  assert.equal((await read({ trigger: 'agent claude-02' })).run?.id, view.run?.id);
});

test('a failing run asks the human: one blocking item for the trail, gone once they chose to fix main', async () => {
  const snap = await adapter.loadMap(mapId);
  const items = (view: MainChecksView) =>
    mainChecksSource.collect({ snaps: [snap], mainChecks: [view] } as AttentionInput);
  const [item] = items(await read());
  assert.equal(item.urgency, 'blocking');
  assert.match(item.title, /test already fails on main/);
  assert.deepEqual(item.holds, [snap.tickets[0].id]);
  chooseMain({ root, mapId, choice: { kind: 'fix-main' } });
  const fixing = await read();
  assert.deepEqual(fixing.state, { kind: 'failed', failing: ['test'], fixing: true });
  assert.equal(fixing.holds, true);
  assert.deepEqual(items(fixing), []);
  chooseMain({ root, mapId, choice: { kind: 'undo-fix-main' } });
  assert.equal(items(await read()).length, 1);
});

/** A completion's failing `test`, its output written as its log. */
function completionCheck(output: string): CheckResult {
  const log = '.evidence/m/1/A-1/test.log';
  mkdirSync(path.join(root, path.dirname(log)), { recursive: true });
  writeFileSync(path.join(root, log), output);
  const base = { argv: [], cwd: '.', signal: undefined, timedOut: false, durationMs: 5, truncated: false };
  return { ...base, name: 'test', exitCode: 1, log, tail: output };
}

test('Start anyway: the same failure later is a known failure, a new one is not', async () => {
  chooseMain({ root, mapId, choice: { kind: 'proceed' } });
  const view = await read();
  assert.deepEqual(view.state, { kind: 'accepted', known: ['test'], dropped: [] });
  assert.equal(view.holds, false);
  const known = trailKnownFailures(root, mapId);
  const lint = { ...completionCheck('ok'), name: 'lint', exitCode: 0 };
  const elsewhere = '/somewhere/else/app-wt';
  const same = completionCheck(`FAIL src/App.test.tsx > should render title (${elsewhere})`);
  const graded = withKnownFailures(
    { checks: [lint, same], result: 'fail' },
    { root, known, asked: 2, folders: [elsewhere] },
  );
  assert.equal(graded.result, 'pass');
  assert.deepEqual(
    graded.knownFailures?.map((k) => k.name),
    ['test'],
  );
  assert.match(graded.note ?? '', /already does on main/);
  const gaps = proofGaps({ attempt: { ...attemptOf(graded), level: 'checks' }, reviews: [] });
  assert.ok(gaps.some((g) => /Known failures, already failing on main: test/.test(g)));
  const worse = completionCheck('FAIL src/App.test.tsx > should render title\nFAIL src/Nav.test.tsx > links');
  const sent = withKnownFailures({ checks: [lint, worse], result: 'fail' }, { root, known, asked: 2, folders: [] });
  assert.equal(sent.result, 'fail');
  // a check that didn't run (fail fast) can't pass on the others' word
  const short = withKnownFailures({ checks: [same], result: 'fail' }, { root, known, asked: 2, folders: [elsewhere] });
  assert.equal(short.result, 'fail');
  chooseMain({ root, mapId, choice: { kind: 'undo-proceed' } });
  assert.equal((await read()).state.kind, 'failed');
  assert.deepEqual(trailKnownFailures(root, mapId), []);
});

function attemptOf(g: { checks: CheckResult[]; result: 'pass' | 'fail' | 'error'; knownFailures?: unknown }) {
  const at = { v: 1 as const, id: 'A-1', mapId, ticketId: '1', ticketKey: '#1', agent: 'a', configHash: 'h' };
  return { ...at, submittedAt: 0, finishedAt: 0, resolution: 'r', ...g } as Parameters<typeof proofGaps>[0]['attempt'] &
    object;
}

test('Drop a check for this trail: completions stop running it until it is restored', async () => {
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets[0];
  assert.deepEqual(levelFor(root, snap, t).info.checks, ['lint', 'test']);
  chooseMain({ root, mapId, choice: { kind: 'drop', check: 'test' } });
  assert.deepEqual(levelFor(root, snap, t).info.checks, ['lint']);
  assert.deepEqual((await read()).state, { kind: 'accepted', known: [], dropped: ['test'] });
  assert.throws(() => chooseMain({ root, mapId, choice: { kind: 'drop', check: 'lint' } }), /didn't fail on main/);
  chooseMain({ root, mapId, choice: { kind: 'restore', check: 'test' } });
  assert.deepEqual(levelFor(root, snap, t).info.checks, ['lint', 'test']);
  const actions = journalFile(root)
    .readMainChecks(mapId)
    .map((e) => e.action);
  assert.deepEqual(actions, ['fix-main', 'undo-fix-main', 'proceed', 'undo-proceed', 'drop', 'restore']);
});

test('main fixed: Run checks on main passes and nothing waits; the run is journaled', async () => {
  writeFileSync(path.join(repo, 'title.txt'), 'Title');
  git('add', 'title.txt');
  git('commit', '-qm', 'fix main');
  const start = requestMainRun(env(), { mapId });
  assert.equal(start.kind, 'started');
  if (start.kind !== 'started') return;
  const run = await start.done;
  assert.equal(run.result, 'pass');
  const view = await read();
  assert.deepEqual(view.state, { kind: 'passed' });
  assert.equal(view.holds, false);
  assert.equal(journalFile(root).readMainChecks(mapId).at(-1)?.action, 'run');
});

test('without approved checks nothing runs on main and nothing waits', async () => {
  const other = path.join(tempFolder('teamtrail-main-off-'), '.teamtrail');
  mkdirSync(other);
  const view = await readMainChecks({ root: other }, 'x', { trigger: 'agent a' });
  assert.equal(view.state.kind, 'off');
  assert.equal(view.holds, false);
});

test('with a check runner (Cloud) the run goes to it: only the checks asked count, on the commit it names', async () => {
  const head = git('rev-parse', 'HEAD').toString().trim();
  const asked: string[][] = [];
  const runner: CheckRunner = {
    name: 'Cloud runner',
    run: () => Promise.reject(new Error('not for completions')),
    runMain: (job) => {
      asked.push(job.checks.map((c) => c.name));
      const checks = job.checks.map((c) => ({
        name: c.name,
        exitCode: c.name === 'test' ? 1 : 0,
        timedOut: false,
        durationMs: 3,
        output: c.name === 'test' ? 'FAIL src/App.test.tsx > should render title' : 'ok',
      }));
      return Promise.resolve({
        checks,
        git: { head, branch: 'main', base: { head: null, branch: null }, changed: [] },
      });
    },
  };
  const start = requestMainRun({ root, checkRunner: runner }, { mapId });
  assert.equal(start.kind, 'started');
  if (start.kind !== 'started') return;
  const run = await start.done;
  assert.deepEqual(asked, [['lint', 'test']]);
  assert.equal(run.runner, 'Cloud runner');
  assert.equal(run.commit, head);
  assert.equal(run.result, 'fail');
  // a runner that can't run checks on main makes the run unavailable: nothing waits on it
  const without: CheckRunner = { name: 'Old runner', run: runner.run };
  const none = requestMainRun({ root, checkRunner: without }, { mapId });
  if (none.kind !== 'started') return assert.fail('expected a run');
  assert.equal((await none.done).result, 'unavailable');
  const view = await read();
  assert.deepEqual(view.state, { kind: 'unavailable', reason: "Old runner doesn't run checks on main" });
  assert.equal(view.holds, false);
});

test("a runner whose server holds no checkout of the code is never named this folder's git head", async () => {
  // Cloud's engine: its folder can sit inside an unrelated clone, whose head GitHub doesn't know in the repository.
  const named: (string | undefined)[] = [];
  const runner: CheckRunner = {
    name: 'Hosted runner',
    holdsCode: false,
    run: () => Promise.reject(new Error('not for completions')),
    runMain: (job) => {
      named.push(job.commit ?? job.branch);
      return Promise.reject(new Error('the sandbox is busy'));
    },
  };
  const start = requestMainRun({ root, checkRunner: runner }, { mapId });
  if (start.kind !== 'started') return assert.fail('expected a run');
  const run = await start.done;
  assert.deepEqual(named, [undefined], 'no commit and no branch named: the runner takes the default branch head');
  assert.equal(run.commit, null);
  assert.equal(run.result, 'unavailable');
});

test('journal: main-checks entries sit next to transitions and kinds a newer version wrote', () => {
  const dir = path.join(tempFolder('teamtrail-main-journal-'), '.teamtrail');
  mkdirSync(path.join(dir, '.events'), { recursive: true });
  const lines = [
    { v: 1, at: 1, mapId: 'm', ticketId: '1', ticketKey: '#1', event: 'claim', from: 'ready', to: 'working' },
    {
      v: 1,
      kind: 'main-checks',
      at: 2,
      mapId: 'm',
      action: 'proceed',
      runId: 'M-1',
      actor: 'trail lead',
      actorKind: 'trail lead',
    },
    { v: 1, kind: 'from-the-future', at: 3, mapId: 'm' },
  ];
  writeFileSync(path.join(dir, '.events', 'm.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const j = journalFile(dir);
  assert.equal(j.read('m').length, 1);
  assert.deepEqual(
    j.readMainChecks('m').map((e) => [e.action, e.runId]),
    [['proceed', 'M-1']],
  );
});

describe_routes();

function describe_routes() {
  let bridge: TrackerBridge;
  let server: http.Server;
  let base: string;
  before(async () => {
    bridge = createTrackerBridge(root, { env: {}, cwd: repo, mainChecks: { pollMs: 60_000 } });
    server = http.createServer((req, res) => void bridge.handle(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  after(() => {
    bridge.close();
    server.close();
  });
  const call = async (method: string, p: string, body?: unknown) => {
    const headers = { 'Content-Type': 'application/json' };
    const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as MainChecksView & { error?: string; run?: { id: string } } };
  };

  test('the bridge serves checks on main, takes the trail lead’s choices and runs them on demand', async () => {
    const got = await call('GET', `/main-checks?mapId=${mapId}`);
    assert.equal(got.status, 200);
    assert.equal(got.json.mapId, mapId);
    const bad = await call('POST', '/main-checks/choose', { mapId, choice: { kind: 'drop' } });
    assert.equal(bad.status, 400);
    const ran = await call('POST', '/main-checks/run', { mapId });
    assert.equal(ran.status, 200);
    assert.ok(ran.json.run?.id);
    const project = await call('GET', '/main-checks');
    assert.equal(project.json.run?.id, ran.json.run?.id);
  });
}
