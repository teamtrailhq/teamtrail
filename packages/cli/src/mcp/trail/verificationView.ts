import type { GitBaseline, GitEvidence, MapSnapshot, Ticket, VerificationAttempt } from '@teamtrail/core';
import {
  activeWaivers,
  checkPassed,
  checksApproval,
  checksWaitReason,
  levelFor,
  readAttempts,
  type Settled,
} from '@teamtrail/core/agents';

/** Failing checks of an attempt, as an agent needs them to fix the work. */
export const feedbackOf = (a: VerificationAttempt) =>
  a.checks
    .filter((c) => !checkPassed(c))
    .map((c) => ({
      check: c.name,
      exitCode: c.exitCode,
      ...(c.timedOut ? { timedOut: true } : {}),
      ...(c.error ? { error: c.error } : {}),
      tail: c.tail,
    }));

/** Whether the check commands wait for the trail lead's approval on this machine, said plainly. */
function waiting(root: string) {
  const a = checksApproval(root);
  return a.waiting ? { waitingForApproval: checksWaitReason(a) } : {};
}

export const checksOf = (a: VerificationAttempt) =>
  a.checks.map((c) => ({ name: c.name, ok: checkPassed(c), exitCode: c.exitCode, durationMs: c.durationMs }));

/**
 * What a ticket's completion will be checked against, and why the last one
 * failed when it is back for rework. Empty when verification is off, so
 * results for trails without verification read as they always have.
 */
export function verificationView(root: string, snap: MapSnapshot, t: Ticket) {
  const { info, config } = levelFor(root, snap, t);
  if (info.level === 'off') return {};
  const last = readAttempts(root, snap.map.id, t.id).at(-1);
  const failed = t.status === 'rework' && last?.result === 'fail';
  return {
    verification: {
      level: info.level,
      source: info.source,
      checks: info.checks.map((name) => {
        const spec = config.config?.checks[name];
        return { name, run: spec?.run, ...(spec?.cwd ? { cwd: spec.cwd } : {}) };
      }),
      ...(config.errors.length ? { configErrors: config.errors } : {}),
      ...waivedView(root, snap.map.id, t.id),
      ...waiting(root),
      howTo:
        'close_ticket (or report_completion) runs these checks before the ticket is done. Run them yourself first.',
    },
    ...(t.status === 'rework' && last ? guardView(last) : {}),
    ...(failed && last
      ? {
          rework: {
            attempt: last.id,
            failures: feedbackOf(last),
            note: "The last completion failed these checks. Fix the cause, then close_ticket again. If a check can't pass in this repo (no such script, nothing to run), say so to the human: only they can accept the ticket without it.",
          },
        }
      : {}),
  };
}

/** Checks the trail lead accepted this ticket without: they don't run on its completions until undone. */
function waivedView(root: string, mapId: string, ticketId: string) {
  const waived = activeWaivers(root, mapId, ticketId).flatMap((w) =>
    w.checks.map((c) => ({ check: c.name, by: w.by, reason: w.reason })),
  );
  return waived.length ? { waived } : {};
}

/** The result of a finished verification run, for the agent. */
export function settledView(s: Settled) {
  const { attempt: a } = s;
  const base = {
    status: s.phase,
    attempt: a.id,
    checks: checksOf(a),
    ...(a.waived?.length ? { skipped: a.waived.map((w) => ({ check: w.name, by: w.by, reason: w.reason })) } : {}),
    ...(a.criteria ? { criteria: a.criteria.lines } : {}),
    ...(a.git ? { git: gitView(a.git) } : {}),
    ...guardView(a),
  };
  const unmet = a.criteria ? [...a.criteria.missing, ...a.criteria.failed] : [];
  if (s.phase === 'rework')
    return {
      ...base,
      feedback: feedbackOf(a),
      attemptsLeft: s.maxAttempts - s.failures,
      howTo: unmet.length
        ? `Give passing evidence for ${unmet.join(', ')} (see criteria), then claim_ticket ${a.ticketKey} again and complete it.`
        : `Fix the failing checks, then claim_ticket ${a.ticketKey} again and close_ticket.`,
    };
  if (s.phase === 'blocked')
    return {
      ...base,
      ...(a.result === 'fail' ? { feedback: feedbackOf(a) } : {}),
      note: blockedNote(s),
    };
  if (s.phase === 'verifying')
    return {
      ...base,
      note: a.criteria?.manual.length
        ? `Checks passed; the human signs off ${a.criteria.manual.join(', ')} in the Lookout. Move on to another ticket.`
        : 'Checks passed; another agent reviews the work next. Move on to another ticket.',
    };
  return base;
}

/**
 * What the check guard found, for the agent that can undo it: each change to what its checks run, or to their tests.
 * Observed findings went through; enforced ones hold a pass for the human.
 */
function guardView(a: VerificationAttempt) {
  if (!a.guard) return {};
  return {
    checkGuard: {
      held: a.guard.mode === 'enforce' && a.result === 'pass',
      findings: a.guard.findings.map((f) => ({ file: f.file, ...(f.check ? { check: f.check } : {}), what: f.text })),
      howTo:
        'Approved checks only count when the work leaves what they run alone. Undo these changes (scripts, test-runner config, files a check runs, skipped or removed tests); if one is needed, say why in the resolution: the trail lead decides.',
    },
  };
}

/** Why a blocked completion waits on the human, in the agent's terms. */
function blockedNote(s: Settled) {
  const { attempt: a } = s;
  if (a.result === 'pass' && a.guard?.mode === 'enforce')
    return `The checks passed, but your work changed what they run (see checkGuard), so the pass doesn't count yet: the trail lead accepts it or sends it back in the Lookout. If it comes back, undo those changes first. Move on to another ticket.`;
  if (a.runner && a.result === 'error')
    return `${a.runner} couldn't run the checks (${a.note}). Make sure your branch is pushed; the human decides in the Lookout. Move on to another ticket.`;
  if (a.remote && !a.runner)
    return "You're connected remotely, so no check ran on your work: the human reviews it in the Lookout. Make sure your branch is pushed and named in the resolution (or pass pr), then move on to another ticket.";
  if (a.result === 'fail')
    return `${s.failures} failed attempts: the human decides in the Lookout. Move on to another ticket.`;
  return `The checks could not run (${a.note}). The human has to fix verification.json; move on to another ticket.`;
}

const short = (sha?: string | null) => sha?.slice(0, 12) ?? null;

/** The worktree a claim starts from, as the claiming agent sees it. */
export const baselineView = (b: GitBaseline) =>
  b.git
    ? { head: short(b.git.head), branch: b.git.branch, dirtyAtClaim: Object.keys(b.git.dirty).length }
    : { note: `${b.note ?? 'no git'}: changes are not tracked` };

/** Git facts of an attempt: what changed since the claim and the flags raised. */
export const gitView = (g?: GitEvidence) =>
  g && {
    ...(g.base ? { base: short(g.base.head) } : {}),
    ...(g.tree ? { head: short(g.tree.head), branch: g.tree.branch } : {}),
    files: g.stats.files,
    added: g.stats.add,
    removed: g.stats.del,
    changed: g.changed.slice(0, 30).map((c) => c.path),
    flags: g.flags.map((f) => ({ kind: f.kind, level: f.level, message: f.message })),
  };
