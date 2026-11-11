import { existsSync } from 'node:fs';
import type { GitEvidence, StaleCheck } from '../model/evidence';
import type { VerificationAttempt, VerificationConfig } from '../model/verification';
import { trustedChecks } from '../verification/checksApproval';
import { findWorktree, readTreeState } from './treeState';

const short = (sha?: string | null) => sha?.slice(0, 8) ?? 'none';

/**
 * Whether the code (or verification.json) changed since `ev` was taken: a
 * passing attempt's result only holds for the code it ran on. Without git
 * evidence nothing is compared and the result is `checked: false`.
 */
export async function staleness(root: string, ev: GitEvidence | undefined): Promise<StaleCheck> {
  const hash = trustedChecks(root).config.hash;
  if (ev && (ev.configHash ?? null) !== (hash ?? null))
    return { checked: true, stale: true, reason: 'verification.json changed since the checks ran' };
  if (!ev?.tree || !existsSync(ev.tree.toplevel)) return { checked: false, stale: false };
  const wt = await findWorktree(ev.tree.toplevel, root);
  if ('error' in wt) return { checked: false, stale: false, reason: wt.error };
  const now = await readTreeState(wt);
  if (now.head !== ev.tree.head)
    return { checked: true, stale: true, reason: `HEAD moved from ${short(ev.tree.head)} to ${short(now.head)}` };
  if (now.fingerprint !== ev.tree.fingerprint)
    return { checked: true, stale: true, reason: 'uncommitted changes differ from the verified code' };
  return { checked: true, stale: false };
}

/**
 * What a stale result means under the config's `stale` policy before a
 * passing attempt moves the ticket on: `reverify` runs the checks again,
 * `flag` only shows it. Attempts that did not pass are never re-run for this.
 */
export async function staleAction(
  root: string,
  config: Pick<VerificationConfig, 'stale'>,
  a: Pick<VerificationAttempt, 'result' | 'git'>,
): Promise<{ action: 'fresh' | 'reverify' | 'flag'; check: StaleCheck }> {
  const check = await staleness(root, a.git);
  if (!check.stale || a.result !== 'pass') return { action: 'fresh', check };
  return { action: config.stale, check };
}
