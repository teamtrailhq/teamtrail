import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { noChangesFlag } from '../evidence/noChangesFlag';
import { scopeFlag } from '../evidence/scopeFlag';
import type { GitEvidence } from '../model/evidence';
import type { TicketType } from '../model/types';
import type { CheckResult, VerificationConfig } from '../model/verification';
import type { RunnerCheck, RunnerReport } from './checkRunner';
import { redact, tailOf } from './redact';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const MAX_OUTPUT = 1024 * 1024;
const SHA = /^[0-9a-f]{40}$/;
const text = (v: unknown, max: number) => (typeof v === 'string' ? redact(v.slice(0, max)) : undefined);
const branch = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : null);

/**
 * A runner's report as the engine records it, or why it can't be: only checks that were asked, in order, recorded
 * with the approved command; each output written as that check's log, redacted; the commit it ran on, required, as
 * git evidence with the approved config's hash, a `runner` toplevel nothing local is compared with, and the
 * no-changes flag the config's policy gives. Any field of the wrong shape is a reason, never a crash.
 */
export function readRunnerReport(o: {
  runner: string;
  report: RunnerReport;
  asked: RunnerCheck[];
  log: { dir: string; rel: string };
  config: VerificationConfig;
  configHash?: string;
  ticketType: TicketType;
  noCodeReason?: string;
  touches?: string[];
}): { checks: CheckResult[]; git: GitEvidence } | { error: string } {
  const got: unknown[] = Array.isArray(o.report.checks) ? o.report.checks : [];
  const checks: CheckResult[] = [];
  for (const [i, a] of o.asked.entries()) {
    const r = got[i] as Record<string, unknown> | null | undefined;
    if (!r || typeof r !== 'object' || r.name !== a.name) break;
    checks.push(resultOf(a, r, o.log));
  }
  const g = o.report.git as Record<string, unknown> | undefined;
  if (!g || typeof g !== 'object' || typeof g.head !== 'string' || !SHA.test(g.head))
    return { error: `${o.runner} reported no commit the checks ran on` };
  const base = (g.base && typeof g.base === 'object' ? g.base : {}) as Record<string, unknown>;
  const changed = (Array.isArray(g.changed) ? g.changed : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof c.path === 'string')
    .slice(0, 5000)
    .map((c) => ({
      path: (c.path as string).slice(0, 500),
      add: Number.isInteger(c.add) ? (c.add as number) : null,
      del: Number.isInteger(c.del) ? (c.del as number) : null,
    }));
  const sum = (k: 'add' | 'del') => changed.reduce((s, c) => s + (c[k] ?? 0), 0);
  const scope = scopeFlag({ changed, touches: o.touches, scope: o.config.scope });
  const flags = changed.length
    ? [...(scope ? [scope] : [])]
    : [noChangesFlag({ noChanges: o.config.noChanges, ticketType: o.ticketType, noCodeReason: o.noCodeReason })];
  const git: GitEvidence = {
    v: 1,
    base: {
      head: typeof base.head === 'string' && SHA.test(base.head) ? base.head : null,
      branch: branch(base.branch),
    },
    tree: { toplevel: `runner:${o.runner}`, head: g.head, branch: branch(g.branch), fingerprint: 'runner' },
    changed,
    stats: { files: changed.length, add: sum('add'), del: sum('del') },
    ...(o.configHash ? { configHash: o.configHash } : {}),
    flags,
  };
  return { checks, git };
}

/** One asked check's result, kept to what was asked: its argv and cwd are the approved ones. */
function resultOf(asked: RunnerCheck, got: Record<string, unknown>, log: { dir: string; rel: string }): CheckResult {
  const raw = typeof got.output === 'string' ? got.output : '';
  const output = redact(raw.slice(-MAX_OUTPUT));
  const file = `${safe(asked.name)}.log`;
  mkdirSync(log.dir, { recursive: true });
  writeFileSync(path.join(log.dir, file), output);
  const error = text(got.error, 300);
  return {
    name: asked.name,
    argv: asked.spec.run,
    cwd: asked.spec.cwd ?? '.',
    exitCode: Number.isInteger(got.exitCode) ? (got.exitCode as number) : null,
    ...(typeof got.signal === 'string' ? { signal: got.signal.slice(0, 20) } : {}),
    timedOut: got.timedOut === true,
    durationMs: Number.isFinite(got.durationMs) ? Math.max(0, Math.round(got.durationMs as number)) : 0,
    ...(error ? { error } : {}),
    log: `${log.rel}/${file}`,
    tail: tailOf(output),
    truncated: raw.length > MAX_OUTPUT,
  };
}
