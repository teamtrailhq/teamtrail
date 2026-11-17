import path from 'node:path';
import type { VerificationConfig } from '../model/verification';
import type { CheckRunner, RunnerReport } from '../verification/checkRunner';
import { redact } from '../verification/redact';
import { readRunnerReport } from '../verification/runnerReport';
import { defaultHead } from './defaultHead';
import { mainCheckResult } from './mainCheckResult';
import type { MainRunOutcome } from './mainRunOutcome';
import { mainPaths } from './mainRunStore';

/** Beyond the checks' own total, what a runner gets to fetch main and start: then the engine stops waiting. */
const RUNNER_MARGIN_MS = 15 * 60_000;

async function ask(runner: CheckRunner, job: Parameters<NonNullable<CheckRunner['runMain']>>[0], ms: number) {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(`${runner.name} didn't answer in time`), ms);
  });
  try {
    const report = await Promise.race([runner.runMain!(job), late]);
    if (typeof report === 'string') return report;
    if (!report || typeof report !== 'object') return `${runner.name} gave no report`;
    if (report.error !== undefined) return `${runner.name}: ${redact(String(report.error).slice(0, 300))}`;
    return report as RunnerReport;
  } catch (e) {
    return `the check runner failed: ${redact(String((e as Error)?.message ?? e).slice(0, 200))}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The approved checks on main, run by the embedding server's runner (Cloud), as remote completions are: only the
 * checks asked count, in order, with the approved commands, on the commit it names.
 */
export async function runMainOnRunner(o: {
  root: string;
  repoRoot: string;
  id: string;
  runner: CheckRunner;
  config: VerificationConfig;
  names: string[];
  signal?: AbortSignal;
}): Promise<MainRunOutcome> {
  const runner = o.runner.name;
  if (!o.runner.runMain)
    return {
      result: 'unavailable',
      commit: null,
      branch: null,
      checks: [],
      runner,
      note: `${runner} doesn't run checks on main`,
    };
  const head = await defaultHead(o.repoRoot);
  const known = 'note' in head ? {} : { branch: head.branch, commit: head.commit };
  const asked = o.names.map((name) => ({ name, spec: o.config.checks[name] }));
  const job = {
    runId: o.id,
    ...known,
    checks: asked,
    totalTimeoutSec: o.config.totalTimeoutSec,
    failFast: o.config.failFast,
    signal: o.signal,
  };
  const report = await ask(o.runner, job, o.config.totalTimeoutSec * 1000 + RUNNER_MARGIN_MS);
  const at = { commit: known.commit ?? null, branch: known.branch ?? null, runner };
  if (typeof report === 'string') return { ...at, result: 'unavailable', checks: [], note: report };
  const rel = mainPaths.logs(o.id);
  const read = readRunnerReport({
    runner,
    report,
    asked,
    log: { dir: path.join(o.root, rel), rel },
    config: o.config,
    ticketType: 'research',
  });
  if ('error' in read) return { ...at, result: 'unavailable', checks: [], note: read.error };
  const checks = read.checks.map((c) => mainCheckResult(o.root, c, []));
  const commit = read.git.tree?.head ?? at.commit;
  if (checks.length < asked.length && checks.every((c) => c.passed))
    return { ...at, commit, result: 'unavailable', checks, note: `${runner} did not report every check` };
  return { ...at, commit, result: checks.every((c) => c.passed) ? 'pass' : 'fail', checks };
}
