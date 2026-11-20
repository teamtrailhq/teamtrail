import { DISCOVERY_TYPES } from '../discovery/brief';
import type { ReadinessFinding } from '../model/readiness';
import type { MapSnapshot, Ticket } from '../model/types';
import { frontier } from '../planning/derive';

/**
 * The ready tickets blocking readiness findings hold back: new implementation work whose completion would run checks
 * (`checksOf` gives the checks it runs, undefined when it isn't verified with checks) that a finding stops. A
 * finding without `checks` stops them all. Research, junction and review tickets run no checks, so they go on.
 */
export function readinessHeld(o: {
  snap: MapSnapshot;
  findings: ReadinessFinding[];
  checksOf: (t: Ticket) => string[] | undefined;
}): Ticket[] {
  if (!o.findings.length) return [];
  const ready = frontier(o.snap.tickets, o.snap.map.mode).filter((t) => !DISCOVERY_TYPES.includes(t.type));
  return ready.filter((t) => {
    const checks = o.checksOf(t);
    if (!checks) return false;
    return o.findings.some((f) => !f.checks || f.checks.some((c) => checks.includes(c)));
  });
}
