import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { mainChecksSource } from '../src/attention/sources/mainChecksSource';
import type { AttentionInput } from '../src/attention/types';
import { chooseMain } from '../src/mainChecks/chooseMain';
import { readMainChoices } from '../src/mainChecks/mainChoicesStore';
import { readMainChecks } from '../src/mainChecks/readMainChecks';
import { requestMainRun } from '../src/mainChecks/requestMainRun';
import { chartMap } from '../src/planning/operations/chart';
import { trustKey, trustLedger } from '../src/trust/trustLedger';
import { approveAllHere } from './fakes/trailLead';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const CHECK = "if (!require('fs').existsSync('fixed.txt')) process.exit(1);";

let repo: string;
let root: string;
let mapId: string;
let adapter: MarkdownAdapter;
const git = (...a: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' });
const head = () => git('rev-parse', 'HEAD').toString().trim();
const read = (trigger?: string) => readMainChecks({ root }, mapId, { ...(trigger ? { trigger } : {}), waitMs: 20_000 });

before(async () => {
  repo = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-main-moved-')), 'app');
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
  const charted = await chartMap(adapter, {
    title: 'Title',
    sections: SECTIONS,
    verification: 'checks',
    tickets: [{ ref: 'a', title: 'Build it', type: 'execute', body: '' }],
  });
  mapId = charted.map.id;
  const skipped = { hash: 'test', at: Date.now(), by: 'trail lead', content: '' };
  trustLedger(root).set({ [trustKey.discoverySkipped(mapId)]: skipped });
});

test('a failure on main is run again once main moves, and says so meanwhile instead of asking the human', async () => {
  const failed = await read('agent a');
  assert.equal(failed.run?.result, 'fail');
  assert.equal(failed.run?.commit, head());
  // main moves (fixed on the default branch): the old failure no longer stands for main as it is
  writeFileSync(path.join(repo, 'fixed.txt'), 'yes');
  git('add', 'fixed.txt');
  git('commit', '-qm', 'fix main');
  const stale = await read();
  assert.deepEqual(stale.state, { kind: 'failed', failing: ['test'], fixing: false, moved: true });
  assert.match(stale.reason ?? '', /Main moved since the failing run/);
  const snap = await adapter.loadMap(mapId);
  assert.deepEqual(mainChecksSource.collect({ snaps: [snap], mainChecks: [stale] } as AttentionInput), []);
  // the next ask runs again on the new head, which passes: nothing waits any more
  const again = await read('Teamtrail');
  assert.notEqual(again.run?.id, failed.run?.id);
  assert.equal(again.run?.commit, head());
  assert.deepEqual(again.state, { kind: 'passed' });
  assert.equal(again.holds, false);
});

test('a passing run is not run again just because main moved after the trail first asked', async () => {
  const before = (await read('agent a')).run?.id;
  writeFileSync(path.join(repo, 'more.txt'), 'x');
  git('add', 'more.txt');
  git('commit', '-qm', 'more');
  assert.equal((await read('agent a')).run?.id, before);
});

test("the trail lead's Start anyway carries over to the run made again when main moves", async () => {
  git('rm', '-q', 'fixed.txt');
  git('commit', '-qm', 'break main');
  const start = requestMainRun({ root }, { mapId });
  assert.equal(start.kind, 'started');
  if (start.kind !== 'started') return;
  assert.equal((await start.done).result, 'fail');
  chooseMain({ root, mapId, choice: { kind: 'proceed' } });
  assert.equal((await read()).holds, false);
  writeFileSync(path.join(repo, 'other.txt'), 'x');
  git('add', 'other.txt');
  git('commit', '-qm', 'unrelated');
  const again = await read('Teamtrail');
  assert.notEqual(again.run?.id, start.run.id, 'ran again on the moved head');
  assert.equal(again.run?.result, 'fail');
  assert.deepEqual(again.state, { kind: 'accepted', known: ['test'], dropped: [] });
  assert.equal(again.holds, false, 'work the trail lead let start is not held again');
  assert.equal(readMainChoices(root, mapId).proceed?.runId, again.run?.id);
});
