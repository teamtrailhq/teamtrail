import type { WaivableCheck } from '../model/checkWaiver';
import type { VerificationAttempt } from '../model/verification';
import { contentHash } from '../trust/trustLedger';
import { checkPassed } from './runCheck';

/** Exactly what the page shows of one waivable check: the completion, the check and its command. */
const waiverShownText = (attemptId: string, c: { name: string; argv: string[] }) =>
  `${attemptId}\n${c.name}\n${JSON.stringify(c.argv)}`;

/**
 * The checks of a completion the trail lead may accept its ticket without: the ones that ran here, or on the
 * embedding server's runner, and failed, timed out or couldn't start. Each with the hash of what the page shows, so
 * a waiver only ever covers the failure the person saw.
 */
export function waivableChecks(a: VerificationAttempt | undefined): WaivableCheck[] {
  if (!a || a.result === 'pass' || a.result === 'interrupted') return [];
  return a.checks
    .filter((c) => !checkPassed(c))
    .map((c) => ({ name: c.name, argv: c.argv, hash: contentHash(waiverShownText(a.id, c)) }));
}
