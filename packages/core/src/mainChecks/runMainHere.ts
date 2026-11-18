import path from 'node:path';
import type { VerificationConfig } from '../model/verification';
import { runChecks } from '../verification/runChecks';
import { defaultHead } from './defaultHead';
import { mainCheckResult } from './mainCheckResult';
import type { MainRunOutcome } from './mainRunOutcome';
import { mainPaths } from './mainRunStore';
import { prepareMainWorktree, removeMainWorktree, sweepMainWorktrees } from './mainWorktree';

/**
 * The approved checks on the default branch's head, here: in a worktree Teamtrail prepares from that commit, removed
 * again after. Nothing runs in the user's working tree.
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
    const rel = o.logRel ?? mainPaths.logs(o.id);
    const out = await runChecks(o.config, o.names, {
      repoRoot: wt.path,
      logDir: path.join(o.root, rel),
      logRel: rel,
      signal: o.signal,
    });
    const checks = out.checks.map((c) => mainCheckResult(o.root, c, [wt.path]));
    if (!checks.length) return { ...at, result: 'unavailable', checks, note: out.note ?? 'no check ran' };
    return {
      ...at,
      result: checks.every((c) => c.passed) ? 'pass' : 'fail',
      checks,
      ...(out.note ? { note: out.note } : {}),
    };
  } finally {
    await removeMainWorktree({ root: o.root, top: head.top, id: o.id, links: wt.links });
  }
}
