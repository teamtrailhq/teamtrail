import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { createTrackerBridge } from '../src/bridge';
import type { CheckFinding } from '../src/model/checkScreening';
import type { TrustItem } from '../src/trust/trustItem';
import { localRepoFiles } from '../src/verification/localRepoFiles';
import { memoryRepoFiles } from './fakes/memoryRepoFiles';
import { tempFolder } from './tempFolder';

const tmp = () => tempFolder('teamtrail-screen-');

/** A git checkout (a `.git` folder is all screening asks) with a package.json and a tracker folder. */
function repo() {
  const dir = tmp();
  mkdirSync(path.join(dir, '.git'));
  mkdirSync(path.join(dir, '.teamtrail'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
  return dir;
}

test('localRepoFiles reads inside the checkout only: no links out, nothing large, nothing without git', async () => {
  const dir = repo();
  const outside = tmp();
  writeFileSync(path.join(outside, 'secret.json'), '{"scripts":{"x":"y"}}');
  symlinkSync(path.join(outside, 'secret.json'), path.join(dir, 'linked.json'));
  symlinkSync(outside, path.join(dir, 'out'));
  writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(1024 * 1024 + 1));
  const files = localRepoFiles(dir);
  assert.ok(files);
  assert.match((await files.read('package.json')) ?? '', /vitest/);
  assert.equal(await files.kind('.teamtrail'), 'dir');
  assert.equal(await files.read('linked.json'), undefined, 'a link out of the repo reads as nothing');
  assert.equal(await files.kind('out/secret.json'), undefined);
  assert.equal(await files.read('../' + path.basename(outside) + '/secret.json'), undefined);
  assert.equal(await files.read(path.join(outside, 'secret.json')), undefined, 'absolute paths are refused');
  assert.equal(await files.read('big.txt'), undefined, 'over 1 MB is never read');
  assert.equal(await files.kind('big.txt'), 'file');
  assert.equal(localRepoFiles(outside), undefined, 'not a git checkout: nothing to screen');
});

async function serve(root: string, options: Parameters<typeof createTrackerBridge>[1] = {}) {
  const bridge = createTrackerBridge(root, {
    env: {},
    configDir: path.join(root, 'cfg'),
    leases: { reapMs: 60_000 },
    ...options,
  });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { base, close: () => (server.close(), bridge.close()) };
}

const screenBody = (checks: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ checks }),
});

test('POST /verification/screen and GET /verification/config say which checks cannot run, reading the repo', async () => {
  const dir = repo();
  const root = path.join(dir, '.teamtrail');
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({
      v: 1,
      checks: { test: { run: ['npm', 'test'] }, e2e: { run: ['npm', 'run', 'e2e'] } },
      run: ['test', 'e2e'],
    }),
  );
  const s = await serve(root);
  try {
    const res = await fetch(
      `${s.base}/verification/screen`,
      screenBody([{ name: 'lint', run: ['npm', 'run', 'lint'] }]),
    );
    assert.equal(res.status, 200);
    const { findings } = (await res.json()) as { findings: CheckFinding[] };
    assert.deepEqual(findings, [{ check: 'lint', severity: 'wont-run', text: 'No `lint` script in package.json' }]);
    const config = (await (await fetch(`${s.base}/verification/config`)).json()) as { screening: CheckFinding[] };
    assert.deepEqual(
      config.screening.map((f) => f.check),
      ['e2e'],
    );
    const trust = (await (await fetch(`${s.base}/trust`)).json()) as { items: TrustItem[] };
    const checks = trust.items.find((i) => i.kind === 'checks');
    assert.deepEqual(
      checks?.screening?.map((f) => f.text),
      ['No `e2e` script in package.json'],
      'the approval shows it too',
    );
    const bad = await fetch(`${s.base}/verification/screen`, screenBody([{ name: 'x', run: 'npm test' }]));
    assert.equal(bad.status, 400);
  } finally {
    s.close();
  }
});

test('an embedding server reads the repo its own way (repoFiles)', async () => {
  const root = path.join(tmp(), '.teamtrail');
  mkdirSync(root);
  const files = memoryRepoFiles({ 'package.json': '{"scripts":{"lint":"x"}}' });
  const s = await serve(root, { repoFiles: () => files });
  try {
    const body = screenBody([
      { name: 'lint', run: ['npm', 'run', 'lint'] },
      { name: 'test', run: ['npm', 'test'] },
    ]);
    const { findings } = (await (await fetch(`${s.base}/verification/screen`, body)).json()) as {
      findings: CheckFinding[];
    };
    assert.deepEqual(
      findings.map((f) => f.check),
      ['test'],
    );
    assert.ok(files.reads.includes('package.json'));
  } finally {
    s.close();
  }
});
