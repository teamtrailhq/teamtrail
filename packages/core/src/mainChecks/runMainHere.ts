import path from 'node:path';
import type { SetupOutcome } from '../model/setup';
import type { VerificationConfig } from '../model/verification';
import { hasSetup, runSetup } from '../setup/runSetup';
import { runChecks } from '../verification/runChecks';
import { storedCheckEnvNames } from '../verification/storedCheckEnvNames';
import { defaultHead } from './defaultHead';
import { mainCheckResult } from './mainCheckResult';
import type { MainRunOutcome } from './mainRunOutcome';
import { mainPaths } from './mainRunStore';
import { prepareMainWorktree, removeMainWorktree, sweepMainWorktrees } from './mainWorktree';

/** Said when a check fails in a worktree nothing was installed in. */
const NOTHING_INSTALLED =
  'No setup steps are approved, so nothing was installed in the worktree for main: add them under "setup" in verification.json (npm ci, uv sync --frozen, …).';

type Job = {
  root: string;
  config: VerificationConfig;
  names: string[];
  signal?: AbortSignal;
  rel: string;
};

/** The approved setup steps in the worktree, when the config names any; their logs go in `setup/` next to the checks'. */
async function setupIn(wt: string, o: Job): Promise<SetupOutcome | undefined> {
  if (!hasSetup(o.config.setup)) return undefined;
  const rel = `${o.rel}/setup`;
  return runSetup({
    worktree: wt,
    setup: o.config.setup,
    logDir: path.join(o.root, rel),
    logRel: rel,
    signal: o.signal,
    envNames: storedCheckEnvNames(o.root),
  });
}

async function checksIn(wt: string, o: Job): Promise<Omit<MainRunOutcome, 'commit' | 'branch'>> {
  const setup = await setupIn(wt, o);
  const ran = setup ? { setup: setup.steps } : {};
  if (setup?.failed) return { ...ran, result: 'unavailable', checks: [], note: `setup failed: ${setup.failed}` };
  const out = await runChecks(o.config, o.names, {
    repoRoot: wt,
    logDir: path.join(o.root, o.rel),
    logRel: o.rel,
    signal: o.signal,
    envNames: storedCheckEnvNames(o.root),
  });
  const checks = out.checks.map((c) => mainCheckResult(o.root, c, { folders: [wt], installed: !!setup }));
  if (!checks.length) return { ...ran, result: 'unavailable', checks, note: out.note ?? 'no check ran' };
  const passed = checks.every((c) => c.passed);
  const note = out.note ?? (!passed && !setup ? NOTHING_INSTALLED : undefined);
  return { ...ran, result: passed ? 'pass' : 'fail', checks, ...(note ? { note } : {}) };
}

/**
 * The approved checks on the default branch's head, here: in a worktree Teamtrail prepares from that commit, removed
 * again after, with the approved setup steps run in it first. Nothing runs in the user's working tree, and nothing of
 * it is used: a failed setup is reported as such, and no check runs.
 */
export async function runMainHere(o: {
  root: string;
  repoRoot: string;
  id: string;
  config: VerificationConfig;
  names: string[];
  signal?: AbortSignal;
  /** A commit of the default branch to run on (a trail's combined run), instead of its head. */
  head?: { top: string; branch: string; commit: string };
  /** Where the logs go, relative to the tracker root; defaults to the run on main's folder. */
  logRel?: string;
}): Promise<MainRunOutcome> {
  const head = o.head ?? (await defaultHead(o.repoRoot));
  if ('note' in head) return { result: 'unavailable', commit: null, branch: null, checks: [], note: head.note };
  const at = { commit: head.commit, branch: head.branch };
  await sweepMainWorktrees({ root: o.root, top: head.top });
  const wt = await prepareMainWorktree({ root: o.root, top: head.top, commit: head.commit, id: o.id });
  if ('note' in wt) return { ...at, result: 'unavailable', checks: [], note: `no worktree for main: ${wt.note}` };
  try {
    return { ...at, ...(await checksIn(wt.path, { ...o, rel: o.logRel ?? mainPaths.logs(o.id) })) };
  } finally {
    await removeMainWorktree({ root: o.root, top: head.top, id: o.id });
  }
}
