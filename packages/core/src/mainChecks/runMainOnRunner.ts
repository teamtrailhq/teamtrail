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

/** Why a report doesn't count: the runner ran on another commit than the one named; undefined when it's that one. */
function otherCommit(o: { runner: string; asked?: string; ran: string | null }) {
  if (!o.asked || o.ran === o.asked) return undefined;
  return `${o.runner} ran on ${o.ran?.slice(0, 7) ?? 'no commit it named'}, not ${o.asked.slice(0, 7)} as asked`;
}

/**
 * The approved checks on main, run by the embedding server's runner (Cloud), as remote completions are: only the
 * checks asked count, in order, with the approved commands, on the commit it names. When this checkout named the
 * commit, a report on any other counts as couldn't run.
 */
/** This checkout's default branch head to name, unless the runner says the code isn't here (`holdsCode: false`). */
function localHead(o: { runner: CheckRunner; repoRoot: string }) {
  return o.runner.holdsCode === false ? null : defaultHead(o.repoRoot);
}

export async function runMainOnRunner(o: {
  root: string;
  repoRoot: string;
  id: string;
  runner: CheckRunner;
  config: VerificationConfig;
  names: string[];
  signal?: AbortSignal;
  /**
   * A trail's combined run: the commit to name (null: name none, the runner takes the default branch's head), and the
   * commits the run's commit must contain. Left out, this checkout's default branch head is named.
   */
  head?: { branch: string; commit: string } | null;
  contains?: string[];
  logRel?: string;
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
  const head = o.head === undefined ? await localHead(o) : o.head;
  const known = !head || 'note' in head ? {} : { branch: head.branch, commit: head.commit };
  const asked = o.names.map((name) => ({ name, spec: o.config.checks[name] }));
  const job = {
    runId: o.id,
    ...known,
    checks: asked,
    totalTimeoutSec: o.config.totalTimeoutSec,
    failFast: o.config.failFast,
    ...(o.contains ? { contains: o.contains } : {}),
    signal: o.signal,
  };
  const report = await ask(o.runner, job, o.config.totalTimeoutSec * 1000 + RUNNER_MARGIN_MS);
  const at = { commit: known.commit ?? null, branch: known.branch ?? null, runner };
  if (typeof report === 'string') return { ...at, result: 'unavailable', checks: [], note: report };
  const rel = o.logRel ?? mainPaths.logs(o.id);
  const read = readRunnerReport({
    runner,
    report,
    asked,
    log: { dir: path.join(o.root, rel), rel },
    config: o.config,
    ticketType: 'research',
  });
  if ('error' in read) return { ...at, result: 'unavailable', checks: [], note: read.error };
  const ran = read.git.tree?.head ?? null;
  const moved = otherCommit({ runner, asked: known.commit, ran });
  if (moved) return { ...at, result: 'unavailable', checks: [], note: moved };
  const checks = read.checks.map((c) => mainCheckResult(o.root, c, []));
  const commit = ran ?? at.commit;
  const said = Array.isArray(report.contains) ? report.contains : [];
  const contains = o.contains ? { contains: o.contains.filter((c) => said.includes(c)) } : {};
  if (checks.length < asked.length && checks.every((c) => c.passed))
    return { ...at, ...contains, commit, result: 'unavailable', checks, note: `${runner} did not report every check` };
  return { ...at, ...contains, commit, result: checks.every((c) => c.passed) ? 'pass' : 'fail', checks };
}
