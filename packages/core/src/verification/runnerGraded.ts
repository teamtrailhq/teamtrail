import path from 'node:path';
import type { CriteriaResult } from '../criteria/criteria';
import { gateOutcome } from '../evidence/completionEvidence';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import type { GitEvidence } from '../model/evidence';
import type { CheckResult } from '../model/verification';
import type { CheckRunJob, CheckRunner, RunnerReport } from './checkRunner';
import type { ConfigRead } from './configFile';
import { EVIDENCE_DIR, evidencePaths } from './evidenceStore';
import { gradeCriteria } from './gradeCriteria';
import { redact } from './redact';
import { checkPassed } from './runCheck';
import type { ChecksOutcome } from './runChecks';
import { readRunnerReport } from './runnerReport';
import type { VerifyJob } from './verifyCompletion';

type Graded = ChecksOutcome & { git?: GitEvidence; criteria?: CriteriaResult };
/** Beyond the checks' own total, what a runner gets to fetch the work and start: then the engine stops waiting. */
const RUNNER_MARGIN_MS = 15 * 60_000;

/** The runner's report, or a reason: a throw, a hang past the deadline and a malformed answer each become one. */
async function ask(runner: CheckRunner, job: CheckRunJob, ms: number): Promise<RunnerReport | string> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(`${runner.name} didn't answer in time`), ms);
  });
  try {
    const report = await Promise.race([runner.run(job), late]);
    if (typeof report === 'string') return report;
    if (!report || typeof report !== 'object') return `${runner.name} gave no report`;
    if (report.error !== undefined) return `${runner.name}: ${redact(String(report.error).slice(0, 300))}`;
    return report;
  } catch (e) {
    return `the check runner failed: ${redact(String((e as Error)?.message ?? e).slice(0, 200))}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A remote completion graded by the embedding server's runner: the approved checks (by name, from the config
 * approved on this machine) go to it, and its report counts only for checks that were asked, in order, each with
 * the approved command, on a commit it names (runnerReport.ts). Anything it didn't run is missing, so the attempt
 * can't pass. Then the no-changes gate and the acceptance criteria, as for local work. A runner that throws, hangs
 * or reports an error makes the attempt an error for a human.
 */
export async function runnerGraded(
  env: { root: string; checkRunner: CheckRunner; signal?: AbortSignal },
  job: VerifyJob,
  run: { id: string; config: ConfigRead; waiting?: string },
): Promise<Graded> {
  if (run.waiting) return { checks: [], result: 'error', note: run.waiting };
  const config = run.config.config;
  if (!config)
    return {
      checks: [],
      result: 'error',
      note: 'verification.json is missing or has errors, so no check was sent to the runner',
    };
  const unknown = job.info.checks.filter((n) => !config.checks[n]);
  if (unknown.length) return { checks: [], result: 'error', note: `unknown check ${unknown.join(', ')}` };
  const asked = job.info.checks.map((name) => ({ name, spec: config.checks[name] }));
  const runJob: CheckRunJob = {
    mapId: job.mapId,
    ticketId: job.ticket.id,
    ticketKey: job.ticket.key,
    attemptId: run.id,
    checks: asked,
    totalTimeoutSec: config.totalTimeoutSec,
    failFast: config.failFast,
    ...(job.sub.origin ? { origin: job.sub.origin } : {}),
    ...(job.sub.pr ? { pr: job.sub.pr } : {}),
    ...(job.sub.declaredPaths ? { declaredPaths: job.sub.declaredPaths } : {}),
    signal: env.signal,
  };
  const report = await ask(env.checkRunner, runJob, config.totalTimeoutSec * 1000 + RUNNER_MARGIN_MS);
  if (typeof report === 'string') return { checks: [], result: 'error', note: report };
  const rel = evidencePaths.logs(job.mapId, job.ticket.id, run.id);
  ensureLocalDir(path.join(env.root, EVIDENCE_DIR));
  const read = readRunnerReport({
    runner: env.checkRunner.name,
    report,
    asked,
    log: { dir: path.join(env.root, rel), rel },
    config,
    configHash: run.config.hash,
    ticketType: job.ticket.type,
    noCodeReason: job.sub.noCodeReason,
  });
  if ('error' in read) return { checks: [], result: 'error', note: read.error };
  const outcome = gateOutcome(read.git) ?? outcomeOf(read.checks, asked.length);
  const at = { root: env.root, mapId: job.mapId, ticketId: job.ticket.id, evidence: job.sub.criteria };
  const criteria = gradeCriteria(at, outcome.checks);
  const unmet = criteria ? [...criteria.missing, ...criteria.failed] : [];
  const graded = { ...outcome, git: read.git, ...(criteria ? { criteria } : {}) };
  if (outcome.result !== 'pass' || !unmet.length) return graded;
  return { ...graded, result: 'fail', note: `Acceptance criteria without passing evidence: ${unmet.join(', ')}` };
}

/** Pass only when every asked check ran and passed. With none failed, failFast explains no missing check. */
function outcomeOf(checks: CheckResult[], asked: number): ChecksOutcome {
  const broken = checks.find((c) => c.error);
  if (broken) return { checks, result: 'error', note: `${broken.name}: ${broken.error}` };
  if (checks.some((c) => !checkPassed(c))) return { checks, result: 'fail' };
  if (checks.length < asked) return { checks, result: 'fail', note: 'the runner did not report every check' };
  return { checks, result: 'pass' };
}
