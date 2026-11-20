import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { baselineForClaim } from '../src/evidence/baseline';
import { journalFile } from '../src/history/journalFile';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { proofForTicket } from '../src/proof/proofForTicket';
import { proofMarkdown } from '../src/proof/proofMarkdown';
import { readAttempts } from '../src/verification/evidenceStore';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const passes = (tag: string) => [process.execPath, '-e', `process.exit(0) // ${tag}`];

/**
 * A monorepo in git: `web` runs for apps/web, `api` for services/api (and shared/), `lint` for every change; `web`
 * also guards shared/fixture.json. One execute ticket, completed after `change` edits the working tree.
 */
async function setup(o: { paths?: boolean } = {}) {
  const repo = tempFolder('teamtrail-paths-');
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  const scoped = o.paths !== false;
  const checks = {
    web: { run: passes('web'), ...(scoped ? { paths: ['apps/web/**'], guards: ['shared/fixture.json'] } : {}) },
    api: { run: passes('api'), ...(scoped ? { paths: ['services/api/**', 'shared/**'] } : {}) },
    lint: { run: passes('lint') },
  };
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, checks, run: ['web', 'api', 'lint'] }));
  approveAllHere(root);
  const files: Record<string, string> = {
    'README.md': 'repo\n',
    'apps/web/app.js': 'web\n',
    'services/api/app.py': 'api\n',
    'shared/fixture.json': '{}\n',
    'shared/data.json': '{}\n',
  };
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    writeFileSync(path.join(repo, f), text);
  }
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...a], { cwd: repo });
  git('init', '-q');
  git('add', '-A', '--', '.', ':(exclude).teamtrail');
  git('commit', '-qm', 'init');
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Paths',
    sections: SECTIONS,
    verification: 'checks',
    tickets: [{ ref: 'a', title: 'A', type: 'execute', body: '' }],
  });
  const env = { adapter, root, journal: journalFile(root) };
  const id = tickets[0].id;
  const agent = { actor: 'Scout-1', actorKind: 'agent' as const };
  /** Claims, records the baseline, makes the change, completes; the attempt it wrote. */
  const complete = async (change: () => void) => {
    await transition(adapter, map.id, id, { ...agent, event: 'claim' });
    await baselineForClaim({ root, cwd: repo, mapId: map.id, ticket: tickets[0], agent: 'Scout-1', resume: true });
    change();
    await transition(adapter, map.id, id, { ...agent, event: 'submit' });
    const snap = await adapter.loadMap(map.id);
    const t = snap.tickets[0];
    const info = levelFor(root, snap, t).info;
    await (
      await verify(env, { mapId: map.id, ticket: t, info, sub: { agent: 'Scout-1', resolution: 'did A' } })
    ).done;
    return readAttempts(root, map.id, id).at(-1)!;
  };
  const edit = (f: string, text = 'changed\n') => writeFileSync(path.join(repo, f), text);
  const proof = async () => {
    const snap = await adapter.loadMap(map.id);
    return proofForTicket({ root, snap, ticket: snap.tickets[0], decisions: [] });
  };
  return { repo, root, git, complete, edit, proof };
}

const ran = (a: { checks: { name: string }[] }) => a.checks.map((c) => c.name);
const skipped = (a: { outOfScope?: { name: string; reason: string }[] }) =>
  (a.outOfScope ?? []).map((c) => `${c.name}: ${c.reason}`);

test('a change in one package runs its checks and the unscoped ones; the attempt and proof say what was skipped', async () => {
  const s = await setup();
  const a = await s.complete(() => s.edit('services/api/app.py'));
  assert.equal(a.result, 'pass');
  assert.deepEqual(ran(a), ['api', 'lint']);
  assert.deepEqual(skipped(a), ['web: changes outside apps/web']);
  const proof = await s.proof();
  assert.equal(proof.status, 'verified');
  assert.match(proofMarkdown(proof), /- ⏭️ web \(`.+`\) skipped: changes outside apps\/web/);
});

test('a lockfile, a top manifest or a file in no check’s paths runs every check', async () => {
  for (const f of ['package-lock.json', 'apps/web/yarn.lock', 'README.md']) {
    const s = await setup();
    const a = await s.complete(() => {
      s.edit('services/api/app.py');
      s.edit(f);
    });
    assert.deepEqual(ran(a), ['web', 'api', 'lint'], f);
    assert.equal(a.outOfScope, undefined, f);
  }
});

test('security: moving a file out of a package still runs that package’s checks', async () => {
  const s = await setup();
  const a = await s.complete(() => {
    s.git('mv', 'apps/web/app.js', 'services/api/app.js');
    s.git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'move');
  });
  assert.deepEqual(ran(a), ['web', 'api', 'lint'], 'the old path is a change under apps/web');
});

test('security: a change the check guard reaches runs the check whatever its paths say', async () => {
  const s = await setup();
  const a = await s.complete(() => s.edit('shared/fixture.json', '{"skip":true}\n'));
  assert.deepEqual(ran(a), ['web', 'api', 'lint'], 'web guards shared/fixture.json');
  const b = await (await setup()).complete(() => undefined);
  assert.deepEqual(ran(b), ['web', 'api', 'lint'], 'nothing changed: nothing to scope by');
});

test('security: paths an agent writes into verification.json skip nothing; the file waits for approval', async () => {
  const s = await setup({ paths: false });
  const file = path.join(s.root, 'verification.json');
  const a = await s.complete(() => {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    c.checks.web.paths = ['nowhere/**'];
    c.checks.api.paths = ['services/api/**'];
    writeFileSync(file, JSON.stringify(c));
    s.edit('services/api/app.py');
  });
  assert.notEqual(a.result, 'pass');
  assert.deepEqual(ran(a), []);
  assert.equal(a.outOfScope, undefined);
  assert.match(a.note ?? '', /approv/);
});
