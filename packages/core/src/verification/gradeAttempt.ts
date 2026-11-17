import path from 'node:path';
import type { CriteriaResult, CriterionEvidence } from '../criteria/criteria';
import { flagIfStale, gateOutcome } from '../evidence/completionEvidence';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { withKnownFailures } from '../mainChecks/withKnownFailures';
import type { GitEvidence } from '../model/evidence';
import type { KnownFailure } from '../model/mainChecks';
import type { AttemptKnownFailure } from '../model/verification';
import type { ConfigRead } from './configFile';
import { EVIDENCE_DIR, evidencePaths } from './evidenceStore';
import { gradeCriteria } from './gradeCriteria';
import type { LevelInfo } from './policy';
import { runChecks, type ChecksOutcome } from './runChecks';

export interface GradeInput {
  root: string;
  repoRoot: string;
  mapId: string;
  ticketId: string;
  attemptId: string;
  config: ConfigRead;
  info: LevelInfo;
  git: GitEvidence;
  /** The agent's evidence for each acceptance criterion. */
  evidence?: CriterionEvidence[];
  /** The trail's known failures on main: a check failing only as it does there doesn't fail the attempt. */
  known?: KnownFailure[];
  /** Checks the trail lead waived for the ticket: a criterion they evidence is the agent's word, not a failure. */
  waived?: string[];
  signal?: AbortSignal;
}

type Graded = ChecksOutcome & { knownFailures?: AttemptKnownFailure[] };

/**
 * What an attempt comes to: the git gate, then the checks, then the acceptance
 * criteria. A pass with a criterion that lacks passing evidence is a fail.
 */
export async function gradeAttempt(i: GradeInput): Promise<{ outcome: Graded; criteria?: CriteriaResult }> {
  const checked = gateOutcome(i.git) ?? (await checksOrError(i));
  const known = { root: i.root, known: i.known ?? [], asked: i.info.checks.length, folders: [i.repoRoot] };
  const outcome = withKnownFailures(checked, known);
  if (outcome.checks.length) await flagIfStale(i.root, i.git);
  const criteria = gradeCriteria(
    i,
    outcome.checks,
    outcome.knownFailures?.map((k) => k.name),
  );
  if (!criteria) return { outcome };
  const unmet = [...criteria.missing, ...criteria.failed];
  if (outcome.result !== 'pass' || !unmet.length) return { outcome, criteria };
  const note = `Acceptance criteria without passing evidence: ${unmet.join(', ')}`;
  const { knownFailures: _known, ...rest } = outcome;
  return { outcome: { ...rest, result: 'fail', note }, criteria };
}

/** The ticket's checks, or an error that says why they cannot run. */
async function checksOrError(i: GradeInput): Promise<ChecksOutcome> {
  const { config } = i;
  if (!config.config) {
    const note = config.exists
      ? `verification.json has errors: ${config.errors.join('; ')}`
      : 'verification.json is missing, so the checks this ticket needs cannot run';
    return { checks: [], result: 'error', note };
  }
  const rel = evidencePaths.logs(i.mapId, i.ticketId, i.attemptId);
  ensureLocalDir(path.join(i.root, EVIDENCE_DIR));
  // a known failure must not stop the checks after it: they decide whether the rest of the work is sound
  const failFast = config.config.failFast && !i.known?.length;
  return runChecks({ ...config.config, failFast }, i.info.checks, {
    repoRoot: i.repoRoot,
    logDir: path.join(i.root, rel),
    logRel: rel,
    signal: i.signal,
  });
}
