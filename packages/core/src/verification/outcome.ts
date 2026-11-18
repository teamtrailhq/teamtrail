import { guardReason } from '../checkGuard/guardReason';
import { evidenceLines } from '../evidence/evidenceSummary';
import { flakyReason } from '../flaky/flakyReason';
import { heldAsFlaky } from '../flaky/heldAsFlaky';
import type { LifecycleEvent, TicketPhase } from '../model/lifecycle';
import type { CheckResult, VerificationAttempt } from '../model/verification';

export interface Outcome {
  event: Extract<LifecycleEvent, 'checks.pass' | 'checks.fail' | 'checks.error'>;
  to: TicketPhase;
  reason: string;
}

const ok = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;

/** One line per check, as the ticket comment and the journal show it. */
export const checkLine = (c: CheckResult) => `${c.name} ${checkStatus(c)}`;

function checkStatus(c: CheckResult): string {
  if (ok(c)) return 'passed';
  if (c.timedOut) return 'timed out';
  if (c.error) return `could not run (${c.error})`;
  return `exited ${c.exitCode ?? c.signal}`;
}

/**
 * Where a finished attempt sends the ticket. A pass is done at level `checks`
 * and waits for review above it, unless the check guard holds it: then it waits for the trail lead, blocked, since
 * the work changed what its checks run (checkGuard/). A fail goes back for rework until
 * `maxAttempts` failures, then to a human; an error (checks that cannot run
 * as configured) always goes to a human.
 */
export function outcomeOf(a: VerificationAttempt, failures: number, maxAttempts: number): Outcome {
  const ran = a.checks.map(checkLine).join(', ') || 'no checks configured';
  const held = heldPass(a);
  if (held.length) return { event: 'checks.pass', to: 'blocked', reason: `${a.id} passed, but ${held.join('; and ')}` };
  if (a.result === 'pass') {
    const signOff = a.criteria?.manual ?? [];
    const known = a.knownFailures?.length
      ? ` (${a.knownFailures.map((k) => k.name).join(', ')} already failing on main)`
      : '';
    return {
      event: 'checks.pass',
      to: a.level === 'checks' && !signOff.length ? 'done' : 'verifying',
      reason: `${a.id} passed: ${ran}${known}${signOff.length ? `; ${signOff.join(', ')} need your sign-off` : ''}`,
    };
  }
  if (a.result === 'fail') {
    const last = failures >= maxAttempts;
    return {
      event: 'checks.fail',
      to: last ? 'blocked' : 'rework',
      reason: `${a.id} failed (${failures} of ${maxAttempts} attempts${last ? ', needs you' : ''}): ${
        a.checks
          .filter((c) => !ok(c))
          .map(checkLine)
          .join(', ') || a.note
      }`,
    };
  }
  return { event: 'checks.error', to: 'blocked', reason: `${a.id} could not verify: ${a.note ?? ran}` };
}

/**
 * The criteria part of an attempt, for the ticket comment and the reviewer: each line, then what the marks
 * don't say: how many rest on the agent's word, and whether the trail lead ever confirmed the list.
 */
export function criteriaLines(a: Pick<VerificationAttempt, 'criteria' | 'agent'>): string[] {
  const c = a.criteria;
  if (!c) return [];
  const claimed = c.claimed?.length ?? 0;
  const notes = [
    ...(claimed
      ? [`${claimed} of ${c.lines.length} rest on ${a.agent}'s word (marked ?): claimed, not verified here.`]
      : []),
    ...(c.confirmed === false ? [`These criteria were written by an agent and not confirmed by the trail lead.`] : []),
  ];
  return ['', '**Acceptance criteria**', '', ...c.lines.map((l) => `- ${l}`), ...(notes.length ? ['', ...notes] : [])];
}

/**
 * Why a pass waits for the trail lead, one clause per gate that holds it: the check guard (the work changed what its
 * checks run, checkGuard/) and the flaky gate (it passed only on retry, flaky/flakyGate.ts). Both may hold one pass;
 * the trail lead's accept counts it past both, rework sends it back.
 */
function heldPass(a: VerificationAttempt): string[] {
  if (a.result !== 'pass') return [];
  return [
    ...(a.guard?.mode === 'enforce' ? [`the work changed what its checks run: ${guardReason(a.guard.findings)}`] : []),
    ...(a.flaky && heldAsFlaky(a) ? [`only on retry: ${flakyReason(a.flaky.checks)}`] : []),
  ];
}

function blockedHead(a: VerificationAttempt) {
  if (a.result === 'pass') return 'passed · held for the trail lead';
  return a.result === 'fail' ? 'failed · needs a human' : 'could not run · needs a human';
}

/** The ticket comment for a finished attempt: result, checks, and the output of the first failing one. */
export function attemptComment(a: VerificationAttempt, o: Outcome) {
  const head = {
    done: 'passed · done',
    verifying: 'passed · waiting for review',
    rework: 'failed · back for rework',
    blocked: blockedHead(a),
  }[o.to as 'done'];
  const failed = a.checks.find((c) => !ok(c));
  const tail = failed?.tail.split('\n').slice(-20).join('\n');
  return [
    `**Verification ${a.id} ${head ?? o.to}**`,
    '',
    ...a.checks.map((c) => `- ${checkLine(c)} · ${(c.durationMs / 1000).toFixed(1)} s`),
    ...(a.note ? ['', a.note] : []),
    ...(a.flaky ? ['', `Passed only on retry: ${flakyReason(a.flaky.checks)}.`] : []),
    ...criteriaLines(a),
    ...(a.git ? ['', ...evidenceLines(a.git)] : []),
    ...(failed && tail
      ? ['', `\`${failed.name}\` output (last lines):`, '', '```', tail.replace(/```/g, "'''"), '```']
      : []),
  ].join('\n');
}
