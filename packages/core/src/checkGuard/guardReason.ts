import type { GuardFinding } from '../model/checkGuard';

const SHOWN = 3;

/** The findings in one line: the first few, then how many more. "package.json scripts.test changed; 2 tests skipped in a.test.ts". */
export function guardReason(findings: GuardFinding[]): string {
  const shown = findings.slice(0, SHOWN).map((f) => f.text);
  const more = findings.length - shown.length;
  return `${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}`;
}
