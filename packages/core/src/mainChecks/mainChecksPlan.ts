import type { VerificationConfig } from '../model/verification';
import { trustedChecks } from '../verification/checksApproval';

export type MainChecksPlan =
  | { kind: 'off'; reason: string }
  | { kind: 'run'; config: VerificationConfig; names: string[]; hash: string; budgetMs: number };

/** Beyond the checks' own budget: preparing the worktree, or a runner fetching main. */
const MARGIN_MS = 15 * 60_000;

/**
 * What a run on main would run: the checks every completion runs (`run` in verification.json), from the file the trail
 * lead approved on this machine only. While it waits for approval, or names no checks, nothing runs on main.
 */
export function mainChecksPlan(root: string): MainChecksPlan {
  const { config, approval } = trustedChecks(root);
  if (approval.state !== 'approved') {
    const reason =
      approval.state === 'none'
        ? 'No checks are set for this project.'
        : 'The check commands wait for your approval (Settings → Approvals).';
    return { kind: 'off', reason };
  }
  const c = config.config;
  if (!c || !config.hash) return { kind: 'off', reason: 'verification.json has errors, so no check can run.' };
  const names = c.run.filter((n) => !!c.checks[n]);
  if (!names.length) return { kind: 'off', reason: 'verification.json names no checks to run.' };
  return { kind: 'run', config: c, names, hash: config.hash, budgetMs: c.totalTimeoutSec * 1000 + MARGIN_MS };
}
