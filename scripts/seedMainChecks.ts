import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { trustedChecks, writeMainRun } from '@teamtrail/core/agents';

/**
 * Checks on main, already run: a passing run of the approved checks at this repo's HEAD, which every seeded trail
 * starts from. Without it `npm run dev` would run the repo's own typecheck and tests on main as the Lookout starts.
 */
export function seedMainChecks(o: { root: string; repoRoot: string; mapIds: string[]; now: number }) {
  const { config } = trustedChecks(o.root);
  const c = config.config;
  if (!c || !config.hash) return;
  let commit: string | null = null;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: o.repoRoot, encoding: 'utf8' }).trim();
  } catch {
    // not a git checkout: the run says so by its missing commit
  }
  const id = 'M-seed';
  const checks = c.run.map((name, i) => ({
    name,
    argv: c.checks[name]?.run ?? [],
    passed: true,
    exitCode: 0,
    timedOut: false,
    durationMs: 40_000 + i * 15_000,
    tail: 'ok',
  }));
  const startedAt = o.now - 3 * 3600_000;
  writeMainRun(o.root, {
    v: 1,
    id,
    commit,
    branch: 'main',
    startedAt,
    finishedAt: startedAt + 95_000,
    configHash: config.hash,
    checks,
    result: 'pass',
    by: 'Teamtrail',
  });
  const seen = Object.fromEntries(o.mapIds.map((m) => [m, id]));
  fs.writeFileSync(path.join(o.root, '.evidence', '_main', 'trails.json'), `${JSON.stringify(seen)}\n`);
}
