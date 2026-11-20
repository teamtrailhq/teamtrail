import { withLocalGuard } from '../checkGuard/withLocalGuard';
import { completionEvidence } from '../evidence/completionEvidence';
import { trailKnownFailures } from '../mainChecks/withKnownFailures';
import type { ConfigRead } from './configFile';
import { gradeAttempt } from './gradeAttempt';
import { scopeChecks } from './scopeChecks';
import type { VerifyEnv, VerifyJob } from './verifyCompletion';
import { withRules } from './withRules';

/**
 * Git evidence, checks and criteria for work that is in this checkout (or the ticket's worktree). The checks a
 * change is outside of (their `paths`, scopeChecks.ts) don't run and the attempt keeps them; the check guard still
 * reads what they run.
 */
export async function gradeHere(
  env: VerifyEnv,
  job: VerifyJob,
  run: { id: string; config: ConfigRead; checkout: string },
) {
  const { mapId, ticket: t, sub } = job;
  const git = await completionEvidence({
    ...env,
    repoRoot: run.checkout,
    mapId,
    ticket: t,
    config: run.config,
    noCodeReason: sub.noCodeReason,
    touches: sub.touches,
  });
  const scoped = await scopeChecks({ config: run.config.config, job, git, checkout: run.checkout });
  // the diff rules the changed files match: their checks run with the ticket's, their answers go on the attempt
  const files = git.changed.map((c) => c.path);
  const ruled = withRules({ root: env.root, config: run.config.config, job: scoped.job, files });
  // a check a rule asks for runs whatever its paths say: the rule matched this change
  const outOfScope = scoped.outOfScope.filter((c) => !ruled.info.checks.includes(c.name));
  const { outcome, criteria } = await gradeAttempt({
    root: env.root,
    repoRoot: run.checkout,
    mapId,
    ticketId: t.id,
    attemptId: run.id,
    config: run.config,
    info: ruled.info,
    git,
    evidence: sub.criteria,
    known: trailKnownFailures(env.root, mapId),
    waived: job.waived,
    signal: env.signal,
  });
  const graded = {
    ...outcome,
    git,
    ...(criteria ? { criteria } : {}),
    ...ruled.extra,
    ...(outOfScope.length ? { outOfScope } : {}),
  };
  const guarded = [...ruled.info.checks, ...outOfScope.map((c) => c.name)];
  return withLocalGuard(graded, { root: env.root, job, run, checks: guarded }); // checkGuard/
}
