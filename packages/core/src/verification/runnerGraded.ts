import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CriteriaResult } from '../criteria/criteria';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import type { GitEvidence } from '../model/evidence';
import type { CheckResult } from '../model/verification';
import type { CheckRunner, RunnerCheck, RunnerCheckResult, RunnerReport } from './checkRunner';
import type { ConfigRead } from './configFile';
import { EVIDENCE_DIR, evidencePaths } from './evidenceStore';
import { gradeCriteria } from './gradeCriteria';
import { redact, tailOf } from './redact';
import { checkPassed } from './runCheck';
import type { ChecksOutcome } from './runChecks';
import type { VerifyJob } from './verifyCompletion';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const MAX_OUTPUT = 1024 * 1024;
const SHA = /^[0-9a-f]{40}$/;
type Graded = ChecksOutcome & { git?: GitEvidence; criteria?: CriteriaResult };

/** A runner's result for one asked check, kept to what was asked: its argv and cwd are the approved ones. */
function resultOf(asked: RunnerCheck, got: RunnerCheckResult, log: { dir: string; rel: string }): CheckResult {
  const text = redact(String(got.output ?? '').slice(-MAX_OUTPUT));
  const file = `${safe(asked.name)}.log`;
  mkdirSync(log.dir, { recursive: true });
  writeFileSync(path.join(log.dir, file), text);
  return {
    name: asked.name,
    argv: asked.spec.run,
    cwd: asked.spec.cwd ?? '.',
    exitCode: Number.isInteger(got.exitCode) ? got.exitCode : null,
    ...(typeof got.signal === 'string' ? { signal: got.signal.slice(0, 20) } : {}),
    timedOut: got.timedOut === true,
    durationMs: Number.isFinite(got.durationMs) ? Math.max(0, Math.round(got.durationMs)) : 0,
    ...(typeof got.error === 'string' ? { error: got.error.slice(0, 300) } : {}),
    log: `${log.rel}/${file}`,
    tail: tailOf(text),
    truncated: text.length < String(got.output ?? '').length,
  };
}

/** The runner's git facts as evidence: the commit it ran on and what changed since the base. */
function gitOf(runner: string, g: RunnerReport['git']): GitEvidence | undefined {
  if (!g || !SHA.test(String(g.head))) return undefined;
  const changed = (Array.isArray(g.changed) ? g.changed : []).slice(0, 5000).map((c) => ({
    path: String(c.path).slice(0, 500),
    add: Number.isInteger(c.add) ? c.add : null,
    del: Number.isInteger(c.del) ? c.del : null,
  }));
  const sum = (k: 'add' | 'del') => changed.reduce((s, c) => s + (c[k] ?? 0), 0);
  return {
    v: 1,
    base: { head: SHA.test(String(g.base?.head)) ? g.base.head : null, branch: g.base?.branch ?? null },
    tree: { toplevel: `runner:${runner}`, head: g.head, branch: g.branch ?? null, fingerprint: 'runner' },
    changed,
    stats: { files: changed.length, add: sum('add'), del: sum('del') },
    flags: [],
  };
}

/**
 * A remote completion graded by the embedding server's runner: the approved checks (by name, from the config
 * approved on this machine) go to it, and its report counts only for checks that were asked, in order, each with
 * the approved command. Anything it didn't run is missing, so the attempt can't pass. Then the acceptance criteria,
 * as for local work. A runner that throws or reports an error makes the attempt an error for a human.
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
  const report = await env.checkRunner
    .run({
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
    })
    .catch(
      (e: Error) =>
        ({ checks: [], error: `the check runner failed: ${String(e?.message ?? e).slice(0, 200)}` }) as RunnerReport,
    );
  if (report.error)
    return { checks: [], result: 'error', note: `${env.checkRunner.name}: ${String(report.error).slice(0, 300)}` };
  const rel = evidencePaths.logs(job.mapId, job.ticket.id, run.id);
  ensureLocalDir(path.join(env.root, EVIDENCE_DIR));
  const log = { dir: path.join(env.root, rel), rel };
  const got = Array.isArray(report.checks) ? report.checks : [];
  const checks: CheckResult[] = [];
  for (const [i, a] of asked.entries()) {
    const r = got[i];
    if (!r || r.name !== a.name) break;
    checks.push(resultOf(a, r, log));
  }
  const git = gitOf(env.checkRunner.name, report.git);
  const outcome = outcomeOf(checks, asked.length);
  const criteria = gradeCriteria(
    { root: env.root, mapId: job.mapId, ticketId: job.ticket.id, evidence: job.sub.criteria },
    checks,
  );
  const unmet = criteria ? [...criteria.missing, ...criteria.failed] : [];
  const graded = { ...outcome, ...(git ? { git } : {}), ...(criteria ? { criteria } : {}) };
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
