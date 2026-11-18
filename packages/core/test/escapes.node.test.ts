import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { buildAttention } from '../src/attention/buildAttention';
import { DEFAULT_ATTENTION_POLICY } from '../src/attention/defaults';
import { gatherAttention } from '../src/attention/gatherAttention';
import { journalFile } from '../src/history/journalFile';
import type { VerificationAttempt } from '../src/model/verification';
import { chartMap } from '../src/planning/operations/chart';
import { agentScorecard } from '../src/scorecard/agentScorecard';
import { readReverts } from '../src/scorecard/readReverts';
import { scorecardInput } from '../src/scorecard/scorecardInput';
import { writeAttempt } from '../src/verification/evidenceStore';

let repo: string;
let root: string;
let adapter: MarkdownAdapter;
let mapId: string;
const git = (...a: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'pipe' })
    .toString()
    .trim();

function attempt(ticketId: string, base: string, head: string, at: number): VerificationAttempt {
  return {
    v: 1,
    id: 'A-1',
    mapId,
    ticketId,
    ticketKey: `#${ticketId}`,
    agent: 'claude-01',
    level: 'checks',
    configHash: 'h',
    submittedAt: at,
    finishedAt: at + 1,
    resolution: 'done',
    checks: [
      {
        name: 'test',
        argv: ['t'],
        cwd: '.',
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
        log: 'l',
        tail: '',
        truncated: false,
      },
    ],
    result: 'pass',
    git: {
      v: 1,
      base: { head: base, branch: 'main' },
      tree: { toplevel: repo, head, branch: 'main', fingerprint: 'f' },
      changed: [{ path: 'src/auth/login.ts', add: 1, del: 0 }],
      stats: { files: 1, add: 1, del: 0 },
      flags: [],
    },
  };
}

before(async () => {
  repo = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-escapes-')), 'app');
  root = path.join(repo, '.teamtrail');
  mkdirSync(path.join(repo, 'src', 'auth'), { recursive: true });
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(repo, '.gitignore'), '.teamtrail\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'start');
  adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const sections = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
  const charted = await chartMap(adapter, {
    title: 'Login',
    sections,
    tickets: [
      { ref: 'a', title: 'Login', type: 'task', body: '' },
      { ref: 'b', title: 'Logout', type: 'task', body: '' },
    ],
  });
  mapId = charted.map.id;
  const [login, logout] = charted.tickets;
  // #login: committed on main, verified, done, then reverted on main
  const start = git('rev-parse', 'HEAD');
  writeFileSync(path.join(repo, 'src', 'auth', 'login.ts'), 'export const login = 1;\n');
  git('add', '.');
  git('commit', '-qm', 'Add login');
  const head = git('rev-parse', 'HEAD');
  writeAttempt(root, attempt(login.id, start, head, Date.now() - 60_000));
  // #logout: verified and done, never reverted
  writeAttempt(root, attempt(logout.id, start, start, Date.now() - 60_000));
  const journal = journalFile(root);
  for (const t of [login, logout]) {
    await adapter.close(mapId, t.id, 'completed');
    journal.append({
      v: 1,
      kind: 'transition',
      at: Date.now() - 30_000,
      mapId,
      ticketId: t.id,
      ticketKey: t.key,
      event: 'checks.pass',
      from: 'verifying',
      to: 'done',
      actor: 'teamtrail',
      actorKind: 'engine',
    });
  }
  git('revert', '--no-edit', head);
});

test('reads the reverts on the default branch with what each reverted', async () => {
  const reverts = await readReverts(root);
  assert.equal(reverts.length, 1);
  assert.equal(reverts[0].revertedSubject, 'Add login');
  assert.equal(reverts[0].revertedParents.length, 1);
});

test('a verified ticket whose commit was reverted counts on the scorecard and asks for a rule', async () => {
  const card = agentScorecard(await scorecardInput(root, adapter));
  assert.equal(card.escapes?.length, 1);
  assert.equal(card.escapes?.[0].kind, 'reverted');
  assert.deepEqual(
    card.byModel.map((r) => [r.escaped, r.escapeRate]),
    [[1, 0.5]],
  );
  assert.deepEqual(card.byCheck, [{ key: 'test', verified: 2, escaped: 1, escapeRate: 0.5, enough: false }]);

  const input = await gatherAttention({ root, adapter, policy: DEFAULT_ATTENTION_POLICY, now: Date.now() });
  const items = buildAttention(input).items.filter((i) => i.kind === 'escape');
  assert.equal(items.length, 1);
  assert.match(items[0].title, /^#\d+ was verified, then reverted: add a rule\?$/);
  assert.deepEqual(items[0].rule?.when, ['src/auth/**']);
});
