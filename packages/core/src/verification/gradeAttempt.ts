import path from 'node:path';
import type { CriteriaResult, CriterionEvidence } from '../criteria/criteria';
import { flagIfStale, gateOutcome } from '../evidence/completionEvidence';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import type { GitEvidence } from '../model/evidence';
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
  signal?: AbortSignal;
}

/**
 * What an attempt comes to: the git gate, then the checks, then the acceptance
 * criteria. A pass with a criterion that lacks passing evidence is a fail.
 */
export async function gradeAttempt(i: GradeInput): Promise<{ outcome: ChecksOutcome; criteria?: CriteriaResult }> {
  const outcome = gateOutcome(i.git) ?? (await checksOrError(i));
  if (outcome.checks.length) await flagIfStale(i.root, i.git);
  const criteria = gradeCriteria(i, outcome.checks);
  if (!criteria) return { outcome };
  const unmet = [...criteria.missing, ...criteria.failed];
  if (outcome.result !== 'pass' || !unmet.length) return { outcome, criteria };
  const note = `Acceptance criteria without passing evidence: ${unmet.join(', ')}`;
  return { outcome: { ...outcome, result: 'fail', note }, criteria };
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
  return runChecks(config.config, i.info.checks, {
    repoRoot: i.repoRoot,
    logDir: path.join(i.root, rel),
    logRel: rel,
    signal: i.signal,
  });
}
