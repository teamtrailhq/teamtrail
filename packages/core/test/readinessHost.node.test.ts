import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { buildAttention } from '../src/attention/buildAttention';
import { DEFAULT_ATTENTION_POLICY } from '../src/attention/defaults';
import { gatherAttention } from '../src/attention/gatherAttention';
import { createTrackerBridge } from '../src/bridge';
import { journalFile } from '../src/history/journalFile';
import type { RepoFiles } from '../src/model/checkScreening';
import type { LocalProbes, ReadinessView } from '../src/model/readiness';
import { chartMap } from '../src/planning/operations/chart';
import { readinessHost } from '../src/readiness/readinessHost';
import { readReadiness } from '../src/readiness/readReadiness';
import { approveTrust } from '../src/trust/approveTrust';
import { pendingTrust } from '../src/trust/pendingTrust';
import type { CheckRunner } from '../src/verification/checkRunner';
import { memoryRepoFiles } from './fakes/memoryRepoFiles';
import { tempFolder } from './tempFolder';

/* Where readiness is read: this machine's checkout, an embedding server's own probe, or nothing at all. */

const REPO = {
  'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
  'package-lock.json': '{}',
};
const files = (): RepoFiles => Object.assign(memoryRepoFiles(REPO), { seesInstalls: true });
const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

function scratch(prefix: string) {
  const root = path.join(tempFolder(prefix), 'repo', '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
}

const runner = (holdsCode?: boolean) =>
  ({ name: 'cloud', ...(holdsCode === undefined ? {} : { holdsCode }) }) as CheckRunner;

test('host: this machine by default; a runner probes nothing here; one without the code reads nothing here', () => {
  const root = scratch('teamtrail-ready-host-');
  assert.equal(readinessHost({ root }).probe, true);
  assert.equal(readinessHost({ root, checkRunner: runner() }).probe, false);
  const elsewhere = readinessHost({ root, checkRunner: runner(false) });
  assert.equal(elsewhere.files(), undefined, "another repo's files around the engine's folder never hold work");
  const own = { files: files, probe: false as const };
  assert.equal(readinessHost({ root, host: own, checkRunner: runner(false) }), own);
});

test("an embedding server's probe is read like this machine's: the same findings from the same data", async () => {
  const root = scratch('teamtrail-ready-probe-fn-');
  const probes: LocalProbes = {
    programs: {},
    toolchains: {},
    installed: { '': false },
    browser: { found: true },
    services: {},
    variables: { passed: [], withheld: [] },
  };
  const seen: string[] = [];
  const probe = async (o: { profile: { units: { dir: string }[] } }) => {
    seen.push(...o.profile.units.map((u) => u.dir));
    return probes;
  };
  const r = await readReadiness({ root, files: files(), probe, fresh: true });
  assert.deepEqual(seen, ['']);
  assert.equal(r.probed, 'here');
  assert.ok(
    r.findings.some((f) => f.id === 'install:'),
    'its install finding, as if probed here',
  );
});

test('queue and Start anyway: blocking while verified work waits, asked soon when nothing does or after Start anyway', async () => {
  const root = scratch('teamtrail-ready-queue-');
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root, { by: 'lookout' }), watch: undefined }, root);
  const { map } = await chartMap(adapter, {
    title: 'Trail',
    sections: SECTIONS,
    tickets: [{ ref: 'a', title: 'Build it', type: 'task' as const, body: 'Do it.' }],
  });
  const host = { files, probe: false as const };
  const queue = async () => {
    const input = await gatherAttention({ root, adapter, policy: DEFAULT_ATTENTION_POLICY, now: 1, readiness: host });
    return buildAttention(input).items.filter((i) => i.kind === 'readiness');
  };
  // no trail's work is verified with checks yet: said, but nothing waits on it
  const [quiet] = await queue();
  assert.equal(quiet.urgency, 'soon');
  assert.ok(quiet.reasons.some((r) => /no trail's work is verified with checks/.test(r)));
  // verification on, with no check approved: the task waits
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, default: 'checks', checks: {}, run: [] }));
  for (const i of pendingTrust(root)) approveTrust({ root, items: [{ key: i.key, hash: i.hash }], by: 'trail lead' });
  const [held] = await queue();
  assert.equal(held.urgency, 'blocking');
  assert.match(held.title, /no checks/);

  const configDir = path.join(root, 'cfg');
  const bridge = createTrackerBridge(root, { env: {}, configDir, leases: { reapMs: 60_000 }, readiness: host });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (body: unknown) =>
    fetch(`${base}/repo/readiness/start-anyway`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const before = (await (await fetch(`${base}/repo/readiness`)).json()) as ReadinessView;
    assert.deepEqual(
      before.trails.map((t) => [t.mapId, t.waits]),
      [[map.id, true]],
    );
    const started = (await (await post({ mapId: map.id })).json()) as ReadinessView;
    assert.equal(started.trails[0].waits, false);
    assert.deepEqual(started.trails[0].startedAnyway?.findings, ['checks-none']);
    assert.equal((await queue())[0].urgency, 'soon', 'still on the queue, no longer blocking');
    const undone = (await (await post({ mapId: map.id, undo: true })).json()) as ReadinessView;
    assert.equal(undone.trails[0].waits, true);
    assert.equal((await queue())[0].urgency, 'blocking');
    const actions = journalFile(root)
      .readReadinessChoices(map.id)
      .map((e) => e.action);
    assert.deepEqual(actions, ['start-anyway', 'undo-start-anyway']);
  } finally {
    server.close();
    bridge.close();
  }
});
