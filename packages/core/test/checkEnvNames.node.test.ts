import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { createTrackerBridge } from '../src/bridge';
import { journalFile, journalPath } from '../src/history/journalFile';
import { CHECK_ENV_JOURNAL } from '../src/model/checkEnvEntry';
import type { CheckVariables } from '../src/model/checkScreening';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';
import { checkEnvNames } from '../src/verification/checkEnvNames';
import { runCheck } from '../src/verification/runCheck';
import { tempFolder } from './tempFolder';

function project() {
  const dir = tempFolder('teamtrail-checkenv-');
  mkdirSync(path.join(dir, '.git'));
  const root = path.join(dir, '.teamtrail');
  mkdirSync(root);
  writeFileSync(path.join(dir, '.env.example'), 'DATABASE_URL=postgres://localhost/x\nSTRIPE_SECRET_KEY=\n');
  return { dir, root, cfg: path.join(dir, 'cfg') };
}

/** Every file under `dir`, relative. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => statSync(path.join(dir, f)).isFile());
}

test('names are kept in the machine store, never the repo, and no value is written anywhere', () => {
  const { dir, root, cfg } = project();
  const names = checkEnvNames(root, cfg);
  assert.equal(names.add('DATABASE_URL'), true);
  assert.equal(names.add('database_url'), false, 'already there, whatever the case');
  assert.equal(names.add('APP_*'), true);
  assert.deepEqual(names.names(), ['DATABASE_URL', 'APP_*']);
  assert.throws(() => names.add('GITHUB_TOKEN'), /Teamtrail's own/);
  assert.throws(() => names.add('X=1'), /isn't a variable name/);
  assert.equal(names.remove('APP_*'), true);
  assert.equal(names.remove('APP_*'), false);
  const stored = filesUnder(cfg).filter((f) => f.endsWith('check-env.json'));
  assert.equal(stored.length, 1);
  assert.equal(statSync(path.join(cfg, stored[0])).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(path.join(cfg, stored[0]), 'utf8')).names, ['DATABASE_URL']);
  assert.deepEqual(
    filesUnder(root).filter((f) => f.includes('check-env')),
    [],
    'nothing in the tracker folder',
  );
  assert.ok(!filesUnder(dir).some((f) => !f.startsWith('cfg') && f.includes('check-env')));
});

test('a check gets a name added on this machine, its value from the environment it was started from', async () => {
  const { dir, root, cfg } = project();
  checkEnvNames(root, cfg).add('DATABASE_URL');
  const print =
    "console.log('db:' + (process.env.DATABASE_URL ?? 'none') + ' stripe:' + (process.env.STRIPE_SECRET_KEY ?? 'none'))";
  const spec = { run: [process.execPath, '-e', print], timeoutSec: 30 };
  const run = { repoRoot: dir, logDir: path.join(root, 'logs'), logRel: 'logs' };
  const env = { PATH: process.env.PATH, DATABASE_URL: 'postgres://test', STRIPE_SECRET_KEY: 'sk_test' };
  const without = await runCheck('c', spec, { ...run, env });
  assert.equal(without.tail, 'db:none stripe:none');
  const withName = await runCheck('c', spec, { ...run, env, envNames: checkEnvNames(root, cfg).names() });
  assert.equal(withName.tail, 'db:postgres://test stripe:none');
});

async function serve(root: string, cfg: string) {
  const bridge = createTrackerBridge(root, { env: {}, configDir: cfg, leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { base, close: () => (server.close(), bridge.close()) };
}

const put = (body: unknown) => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('GET and PUT /verification/variables: names only, this machine only, journaled', async () => {
  // what the shell has set, and the list itself, are this machine's: another device reads neither
  assert.equal(thisMachineOnly('GET', '/verification/variables'), true);
  assert.equal(thisMachineOnly('PUT', '/verification/variables'), true);
  const { root, cfg } = project();
  const s = await serve(root, cfg);
  process.env.DATABASE_URL = 'postgres://secret-value';
  try {
    const first = (await (await fetch(`${s.base}/verification/variables`)).json()) as CheckVariables;
    const db = first.needed.find((v) => v.name === 'DATABASE_URL');
    assert.deepEqual(
      { passes: db?.passes, set: db?.set },
      { passes: false, set: true },
      'seen in .env.example, set here, not passed',
    );
    const added = await fetch(`${s.base}/verification/variables`, put({ add: 'DATABASE_URL' }));
    assert.equal(added.status, 200);
    const text = await added.text();
    assert.doesNotMatch(text, /secret-value/);
    const view = JSON.parse(text) as CheckVariables;
    assert.deepEqual(view.added, ['DATABASE_URL']);
    assert.equal(view.needed.find((v) => v.name === 'DATABASE_URL')?.passes, true);
    const bad = await fetch(`${s.base}/verification/variables`, put({ add: 'GITHUB_TOKEN' }));
    assert.equal(bad.status, 400);
    await fetch(`${s.base}/verification/variables`, put({ remove: 'DATABASE_URL' }));
    const entries = journalFile(root).readCheckEnv(CHECK_ENV_JOURNAL);
    assert.deepEqual(
      entries.map((e) => [e.action, e.name, e.actorKind]),
      [
        ['added', 'DATABASE_URL', 'trail lead'],
        ['removed', 'DATABASE_URL', 'trail lead'],
      ],
    );
    assert.doesNotMatch(readFileSync(journalPath(root, CHECK_ENV_JOURNAL), 'utf8'), /secret-value/);
  } finally {
    delete process.env.DATABASE_URL;
    s.close();
  }
});

test('a journal with older kinds and check-env entries still reads both', () => {
  const { root } = project();
  mkdirSync(path.join(root, '.events'), { recursive: true });
  const file = journalPath(root, CHECK_ENV_JOURNAL);
  appendFileSync(file, JSON.stringify({ v: 1, kind: 'future-kind', at: 1, mapId: CHECK_ENV_JOURNAL }) + '\n');
  journalFile(root).append({
    v: 1,
    kind: 'check-env',
    at: 2,
    mapId: CHECK_ENV_JOURNAL,
    action: 'added',
    name: 'REDIS_URL',
    actor: 'trail lead',
    actorKind: 'trail lead',
  });
  journalFile(root).append({
    v: 1,
    kind: 'proof-post',
    at: 3,
    mapId: CHECK_ENV_JOURNAL,
    action: 'on',
    actor: 'trail lead',
    actorKind: 'trail lead',
  });
  assert.deepEqual(
    journalFile(root)
      .readCheckEnv(CHECK_ENV_JOURNAL)
      .map((e) => e.name),
    ['REDIS_URL'],
  );
  assert.equal(journalFile(root).readProofPost(CHECK_ENV_JOURNAL).length, 1);
  assert.deepEqual(journalFile(root).readAll(CHECK_ENV_JOURNAL), []);
});
