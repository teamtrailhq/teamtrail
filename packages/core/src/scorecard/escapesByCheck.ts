import type { EscapeCheckRow, ScorecardTicket } from '../model/scorecard';

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Per check, the tickets it passed on when they were verified and how many of those came back anyway: the checks
 * that let work through. Groups under `minSample` verified tickets are marked and never compared.
 */
export function escapesByCheck(tickets: ScorecardTicket[], minSample: number): EscapeCheckRow[] {
  const counts = new Map<string, { verified: number; escaped: number }>();
  for (const t of tickets) {
    if (!t.verified && !t.escaped) continue;
    for (const check of new Set(t.passedChecks ?? [])) {
      const c = counts.get(check) ?? { verified: 0, escaped: 0 };
      counts.set(check, { verified: c.verified + 1, escaped: c.escaped + (t.escaped ? 1 : 0) });
    }
  }
  return [...counts]
    .map(([key, c]) => ({ key, ...c, escapeRate: round(c.escaped / c.verified), enough: c.verified >= minSample }))
    .sort((a, b) => b.escaped - a.escaped || b.verified - a.verified || a.key.localeCompare(b.key));
}
