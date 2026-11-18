import type { AttemptRule } from '../model/diffRule';
import { oneLine } from '../model/safeText';
import type { VerificationAttempt } from '../model/verification';
import { checkPassed } from './runCheck';

const clip = (s: string, n: number) => {
  const flat = oneLine(s);
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

function ruleLine(a: VerificationAttempt, r: AttemptRule): string[] {
  const ran = r.check ? a.checks.find((c) => c.name === r.check) : undefined;
  const check = ran ? [`  - check ${r.check}: ${checkPassed(ran) ? 'passed' : 'failed'} (verified)`] : [];
  const answer = r.answer ? `answered (the author's word, check it): ${clip(r.answer, 600)}` : 'not answered';
  const waived = r.waived ? `waived by ${clip(r.waived.by, 60)}: ${clip(r.waived.reason, 200)}` : answer;
  const ask = r.ask ? [`  - asks: ${clip(r.ask, 300)}`, `  - ${waived}`] : [];
  return [`- ${r.id} (${clip(r.why, 200)}), for ${r.files.slice(0, 5).join(', ')}`, ...check, ...ask];
}

/**
 * The diff rules a completion matched, for its reviewer: why each exists, what ran, and the author's answers, which
 * nothing verified, so the reviewer judges them against the code. Empty when no rule matched.
 */
export function ruleReviewLines(a: VerificationAttempt): string[] {
  if (!a.rules?.length) return [];
  return ['', '**Diff rules this change matched:**', ...a.rules.flatMap((r) => ruleLine(a, r))];
}
