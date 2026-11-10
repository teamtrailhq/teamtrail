import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge } from '../src/bridge';
import { writeBrief } from '../src/discovery/briefStore';
import { captureBaseline } from '../src/evidence/baseline';
import { completionEvidence } from '../src/evidence/completionEvidence';
import { chartMap } from '../src/planning/operations/chart';
import { trustedChecks } from '../src/verification/checksApproval';

/*
 * N1: a command planted in the repo's own git config, by an agent that can only write files, must never run when
 * Teamtrail reads git: not when the human opens Approvals, not for a claim's baseline, not for completion evidence.
 * Each planted program touches a file in `marks/` when it runs.
 */
const SECTIONS = {
  summary: 'S',
  productContext: '',
  existing: '',
  conventions: '',
  dataModel: '',
  api: '',
  risks: '',
  assumptions: [],
  openQuestions: [],
};

/** A git repo with committed tracker files, then every program its own config can name, planted. */
function plantedRepo() {
  const top = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-planted-'));
  const root = path.join(top, '.teamtrail');
  const marks = path.join(top, 'marks');
  mkdirSync(root, { recursive: true });
  mkdirSync(marks);
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: top });
  git('init', '-q');
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, checks: { t: { run: ['npm', 'test'] } } }),
  );
  writeBrief(root, { mapId: 'm1', status: 'accepted', sections: SECTIONS });
  writeFileSync(path.join(top, 'a.txt'), 'a\n');
  git('add', '.');
  git('commit', '-qm', 'team');
  // the planted programs, each leaving a mark when git runs it
  const touch = (name: string) => `touch ${JSON.stringify(path.join(marks, name))}`;
  const hooks = path.join(top, 'hooks');
  mkdirSync(hooks);
  for (const hook of ['post-checkout', 'post-index-change', 'reference-transaction']) {
    writeFileSync(path.join(hooks, hook), `#!/bin/sh\n${touch(hook)}\n`);
    chmodSync(path.join(hooks, hook), 0o755);
  }
  git('config', 'core.fsmonitor', `${touch('fsmonitor')}; false #`);
  git('config', 'core.hooksPath', hooks);
  git('config', 'diff.external', `sh -c '${touch('external-diff')}' #`);
  git('config', 'diff.evil.textconv', `sh -c '${touch('textconv')}; cat "$0"'`);
  writeFileSync(path.join(top, '.gitattributes'), '* diff=evil\n');
  // and changes, so status and diff have something to look at
  writeFileSync(path.join(top, 'a.txt'), 'changed\n');
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, checks: { t: { run: ['true'] } } }));
  return { top, root, marks };
}

const ran = (marks: string) => readdirSync(marks);

test('N1: opening Approvals runs nothing the repo config names', async () => {
  const { root, marks } = plantedRepo();
  const bridge = createTrackerBridge(root, { env: {}, leases: { reapMs: 60_000 } });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/trust`);
    assert.equal(r.status, 200);
  } finally {
    await new Promise((r) => (server.closeAllConnections(), server.close(r), bridge.close?.()));
  }
  assert.deepEqual(ran(marks), []);
});

async function ticketOf(root: string) {
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Trail',
    sections: { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    tickets: [{ ref: 'a', title: 'Build', type: 'execute', body: '' }],
  });
  return { adapter, mapId: map.id, ticket: tickets[0] };
}

test("N1: a claim's baseline and a completion's evidence run nothing the repo config names", async () => {
  const { top, root, marks } = plantedRepo();
  const { adapter, mapId, ticket } = await ticketOf(root);
  await captureBaseline({ root, cwd: top, mapId, ticket, agent: 'claude-01' });
  writeFileSync(path.join(top, 'b.txt'), 'new\n');
  await completionEvidence({ adapter, root, repoRoot: top, mapId, ticket, config: trustedChecks(root).config });
  assert.deepEqual(ran(marks), []);
  assert.equal(existsSync(path.join(top, '.teamtrail')), true);
});
