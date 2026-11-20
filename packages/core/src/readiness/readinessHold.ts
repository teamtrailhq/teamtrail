import type { ReadinessChoice, ReadinessFinding, RepoReadiness } from '../model/readiness';
import type { MapSnapshot, Ticket } from '../model/types';
import { levelFor } from '../verification/levelFor';
import { holdingFindings } from './holdingFindings';
import { readinessChoice } from './readinessChoices';
import { readinessHeld } from './readinessHeld';
import { readinessReason } from './readinessReason';

/** Readiness on one trail as a claim sees it: the findings that hold it, the tickets held, and why. */
export interface ReadinessHold {
  findings: ReadinessFinding[];
  held: Ticket[];
  /** Whether the findings hold any open implementation work on the trail, ready now or later. */
  waits: boolean;
  reason?: string;
  /** The trail lead's Start anyway, when they made one. */
  startedAnyway?: ReadinessChoice;
}

/** The checks a ticket's completion runs, or undefined when it isn't verified with checks. */
function checksOf(root: string, snap: MapSnapshot) {
  return (t: Ticket) => {
    const { info } = levelFor(root, snap, t);
    return info.level === 'off' ? undefined : info.checks;
  };
}

/** What blocking readiness findings hold on `snap`'s trail, past the trail lead's Start anyway (readinessChoices.ts). */
export function readinessHold(o: { root: string; snap: MapSnapshot; readiness: RepoReadiness }): ReadinessHold {
  const choice = readinessChoice(o.root, o.snap.map.id);
  const findings = holdingFindings(o.readiness, choice);
  const checks = checksOf(o.root, o.snap);
  const held = readinessHeld({ snap: o.snap, findings, checksOf: checks });
  const waits =
    held.length > 0 || readinessHeld({ snap: o.snap, findings, checksOf: checks, among: 'open' }).length > 0;
  const reason = held.length ? readinessReason(findings) : undefined;
  return { findings, held, waits, ...(reason ? { reason } : {}), ...(choice ? { startedAnyway: choice } : {}) };
}
