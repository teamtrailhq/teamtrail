import { checkoutPrefix } from '../checkGuard/checkoutPrefix';
import { checksTouched } from '../checkGuard/checksTouched';
import { commitReader, worktreeReader } from '../checkGuard/gitReaders';
import type { CriterionEvidence } from '../criteria/criteria';
import type { OutOfScopeCheck } from '../model/checkScope';
import type { GitEvidence } from '../model/evidence';
import type { VerificationConfig } from '../model/verification';
import { pathScope } from './pathScope';
import type { LevelInfo } from './policy';

/** The checks a criterion names as its evidence (`check:<name>`): they run, or the criterion couldn't pass. */
const evidenced = (evidence: CriterionEvidence[] = []) =>
  evidence.map((e) => e.evidence.trim()).flatMap((e) => (e.startsWith('check:') ? [e.slice(6).trim()] : []));

/**
 * A local completion's checks without the ones its changes are outside of (pathScope.ts), and those, for the attempt
 * to keep. Only on git evidence this machine can stand behind: a worktree, a baseline recorded and signed at the
 * claim, a base commit; otherwise every check runs. A check stays when a criterion names it, or when the change
 * reaches what it runs as the check guard reads it (its scripts, its tools' config, its `guards`).
 */
export async function scopeChecks<J extends { info: LevelInfo; sub: { criteria?: CriterionEvidence[] } }>(o: {
  config: VerificationConfig | undefined;
  job: J;
  git: GitEvidence;
  checkout: string;
}): Promise<{ job: J; outOfScope: OutOfScopeCheck[] }> {
  const { tree, base, baseline } = o.git;
  const unchanged = { job: o.job, outOfScope: [] };
  if (!tree || !baseline || !base?.head) return unchanged;
  const changed = o.git.changed.map((c) => c.path);
  const at = {
    config: o.config,
    checks: o.job.info.checks,
    changed,
    prefix: checkoutPrefix(tree.toplevel, o.checkout),
  };
  const keep = evidenced(o.job.sub.criteria);
  const first = pathScope({ ...at, keep });
  if (!first.outOfScope.length) return unchanged;
  const read = { before: await commitReader(tree.toplevel, base.head), after: worktreeReader(tree.toplevel) };
  const touched = await checksTouched({ ...at, checks: first.outOfScope.map((c) => c.name), read });
  const scoped = pathScope({ ...at, keep: [...keep, ...touched] });
  return { job: { ...o.job, info: { ...o.job.info, checks: scoped.run } }, outOfScope: scoped.outOfScope };
}
