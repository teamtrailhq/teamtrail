import { DISCOVERY_TYPES } from '../discovery/brief';
import type { ReadinessFinding } from '../model/readiness';
import type { MapSnapshot, Ticket } from '../model/types';
import { frontier } from '../planning/derive';

/**
 * The tickets blocking readiness findings hold back: implementation work whose completion would run checks
 * (`checksOf` gives the checks it runs, undefined when it isn't verified with checks) that a finding stops. A
 * finding without `checks` stops them all. Research, junction and review tickets run no checks, so they go on, and
 * a setup ticket (Ticket.setup) isn't held by the checks findings: it proposes the checks.
 * `among`: the ready tickets (held now, the default), or every open one (what the findings would hold as it comes up).
 */
export function readinessHeld(o: {
  snap: MapSnapshot;
  findings: ReadinessFinding[];
  checksOf: (t: Ticket) => string[] | undefined;
  among?: 'ready' | 'open';
}): Ticket[] {
  if (!o.findings.length) return [];
  const pool =
    o.among === 'open' ? o.snap.tickets.filter((t) => t.state === 'open') : frontier(o.snap.tickets, o.snap.map.mode);
  return pool
    .filter((t) => !DISCOVERY_TYPES.includes(t.type))
    .filter((t) => {
      const checks = o.checksOf(t);
      if (!checks) return false;
      // the setup ticket of a new repo proposes the checks: missing or unapproved checks can't hold it
      const holding = t.setup ? o.findings.filter((f) => f.kind !== 'checks') : o.findings;
      return holding.some((f) => !f.checks || f.checks.some((c) => checks.includes(c)));
    });
}
