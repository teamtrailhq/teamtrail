import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge } from '../src/bridge';
import { chartMap } from '../src/planning/operations/chart';
import { otherProjectPrecedents } from '../src/precedent/otherProjectPrecedents';
import { updateProjects } from '../src/projects/projectsFile';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

/** A repo whose markdown tracker holds one decision. */
async function project(name: string, question: string) {
  const repo = tempFolder(`teamtrail-${name}-`);
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  const a = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map } = await chartMap(a, {
    title: name,
    sections: SECTIONS,
    tickets: [{ ref: 'a', title: 'Work', type: 'task', body: '' }],
  });
  await a.createDecision(map.id, {
    question,
    answer: 'Yes, in UTC.',
    decidedBy: 'trail lead',
    source: { kind: 'hitl' },
    alternatives: [],
    participants: [],
    transcript: [],
  } as unknown as Parameters<MarkdownAdapter['createDecision']>[1]);
  return { repo, root, name };
}

test("another project's decisions are suggested only when it shares them, never as answers", async () => {
  const configDir = tempFolder('teamtrail-config-');
  const here = await project('storefront', 'Unrelated');
  const billing = await project('billing', 'Should invoice dates be stored in UTC?');
  const quiet = await project('quiet', 'Should invoice dates be stored in UTC?');
  const entry = (p: { root: string; repo: string; name: string }, share: boolean) => ({
    id: Buffer.from(p.name).toString('hex').slice(0, 12).padEnd(12, '0'),
    name: p.name,
    path: p.repo,
    root: p.root,
    addedAt: 1,
    sharePrecedents: share,
  });
  updateProjects(configDir, (f) => ({
    ...f,
    projects: [entry(here, true), entry(billing, true), entry(quiet, false)],
  }));
  const found = await otherProjectPrecedents({
    configDir,
    root: here.root,
    query: { text: 'Are invoice dates stored in UTC?' },
  });
  assert.deepEqual(
    found.map((p) => [p.project, p.strength]),
    [['billing', 'suggested']],
  );
  assert.equal(thisMachineOnly('PUT', '/projects/abc123/share'), true);
});

test('GET /decision-memory gives each decision its area and citations', async () => {
  const p = await project('logbook', 'Which timezone?');
  const bridge = createTrackerBridge(p.root, { env: {}, configDir: path.join(p.repo, 'config'), cwd: p.repo });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/decision-memory`);
    assert.equal(r.status, 200);
    const { entries } = (await r.json()) as { entries: Record<string, { area: string; citedBy: string[] }> };
    assert.deepEqual(Object.values(entries), [{ area: 'No area yet', citedBy: [] }]);
  } finally {
    bridge.close();
    server.close();
  }
});
