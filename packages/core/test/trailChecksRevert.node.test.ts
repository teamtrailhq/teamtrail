import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { journalFile } from '../src/history/journalFile';
import { defaultHead } from '../src/mainChecks/defaultHead';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { readReverts } from '../src/scorecard/readReverts';
import { readTrailChecks } from '../src/trailChecks/readTrailChecks';
import { latestTrailRun } from '../src/trailChecks/trailRunStore';
import { trustKey, trustLedger } from '../src/trust/trustLedger';
import { writeAttempt } from '../src/verification/evidenceStore';
import { approveAllHere } from './fakes/trailLead';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

function attempt(o: { mapId: string; ticketId: string; repo: string; head: string }): VerificationAttempt {
  const tree = { toplevel: o.repo, head: o.head, branch: 'x', detached: false, gitDir: '' } as never;
  return {
    ...{ v: 1, id: 'A-1', mapId: o.mapId, ticketId: o.ticketId, ticketKey: o.ticketId, agent: 'claude-01' },
    ...{ level: 'checks', configHash: 'x', submittedAt: 1, finishedAt: 2, resolution: 'done', checks: [] },
    result: 'pass',
    git: { v: 1, tree, changed: [], stats: { files: 1, add: 1, del: 0 }, flags: [] },
  };
}

test("a revert on the remote default branch counts when the run would use it: never 'verified together'", async () => {
  const repo = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-trail-revert-')), 'app');
  const root = path.join(repo, '.teamtrail');
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' })
      .toString()
      .trim();
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(repo, '.gitignore'), '.teamtrail\n');
  writeFileSync(path.join(repo, 'check.js'), "console.log('ok');");
  const checks = { test: { run: [process.execPath, 'check.js'] } };
  writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ v: 1, checks, run: ['test'] }));
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'main');
  approveAllHere(root);
  const adapter = new MarkdownAdapter(nodeMarkdownFs(root), root);
  const charted = await chartMap(adapter, {
    title: 'Trail',
    sections: SECTIONS,
    verification: 'checks',
    tickets: [{ ref: 'a', title: 'Add a', type: 'execute', body: '' }],
  });
  const mapId = charted.map.id;
  trustLedger(root).set({ [trustKey.discoverySkipped(mapId)]: { hash: 't', at: 1, by: 'trail lead', content: '' } });
  const ticket = (await adapter.loadMap(mapId)).tickets[0];
  git('checkout', '-qb', 'work', 'main');
  writeFileSync(path.join(repo, 'a.txt'), 'a');
  git('add', 'a.txt');
  git('commit', '-qm', 'add a');
  const work = git('rev-parse', 'HEAD');
  writeAttempt(root, attempt({ mapId, ticketId: ticket.id, repo, head: work }));
  await adapter.close(mapId, ticket.id, 'completed');
  journalFile(root).append({
    ...{ v: 1, kind: 'transition', at: Date.now() - 30_000, mapId, ticketId: ticket.id, ticketKey: ticket.key },
    ...{ event: 'checks.pass', from: 'verifying', to: 'done', actor: 'teamtrail', actorKind: 'engine' },
  });
  // on the code host the work merged and was then reverted; this clone fetched it, local main wasn't pulled
  git('checkout', '-q', '--detach', 'main');
  git('merge', '-q', '--no-ff', '-m', 'merge work', 'work');
  git('revert', '--no-edit', work);
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  git('checkout', '-q', 'main');

  // one head for everything: the remote branch is ahead of local main, so checks, reverts and escapes read it
  const remote = git('rev-parse', 'refs/remotes/origin/main');
  assert.deepEqual(await defaultHead(repo), { top: realpathSync(repo), branch: 'main', commit: remote });
  assert.deepEqual(
    (await readReverts(root)).map((r) => r.reverts),
    [work],
  );
  const snap = await adapter.loadMap(mapId);
  const view = await readTrailChecks({ root }, snap, { trigger: 'Teamtrail' });
  assert.deepEqual(
    view.merges.map((m) => [m.key, m.state]),
    [[ticket.key, 'reverted']],
  );
  assert.equal(view.state.kind, 'waiting');
  assert.notEqual(view.together.kind, 'passed');
  assert.equal(latestTrailRun(root, mapId), undefined, 'nothing runs on a commit that reverts the work');
});
