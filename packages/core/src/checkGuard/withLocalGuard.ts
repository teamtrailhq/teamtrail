import type { GitEvidence } from '../model/evidence';
import type { AttemptResult } from '../model/verification';
import type { ConfigRead } from '../verification/configFile';
import type { VerifyJob } from '../verification/verifyCompletion';
import { applyGuard } from './applyGuard';
import { localGuard } from './localGuard';

/** A graded local attempt with the check guard applied (localGuard.ts, applyGuard.ts). */
export async function withLocalGuard<T extends { result: AttemptResult; note?: string; git: GitEvidence }>(
  graded: T,
  o: { root: string; job: VerifyJob; run: { config: ConfigRead; checkout: string }; checks: string[] },
) {
  const { git } = graded;
  // a setup ticket's checks are new, proposed by it and approved by the trail lead: nothing they ran before to weaken
  if (git.setup) return graded;
  const guard = await localGuard({ config: o.run.config.config, checks: o.checks, git, checkout: o.run.checkout });
  const ticket = { id: o.job.ticket.id, key: o.job.ticket.key };
  return applyGuard(graded, { guard, root: o.root, mapId: o.job.mapId, ticket });
}
