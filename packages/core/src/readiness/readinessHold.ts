import type { ReadinessChoice, ReadinessFinding, RepoReadiness } from '../model/readiness';
import { NEW_REPO_FINDING } from '../model/setupTicket';
import type { MapSnapshot, Ticket } from '../model/types';
import { levelFor } from '../verification/levelFor';
import { holdingFindings } from './holdingFindings';
import { readinessChoice } from './readinessChoices';
import { readinessHeld } from './readinessHeld';
import { readinessReason } from './readinessReason';
import { setupMergeReason } from './setupMergeReason';
import { setupNotOnMain } from './setupNotOnMain';

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

/** Why work waits: the setup work to merge first when that's all it is, else the first finding (readinessReason.ts). */
function reasonOf(o: { root: string; snap: MapSnapshot; findings: ReadinessFinding[] }) {
  const stillNew = o.findings.some((f) => f.id === NEW_REPO_FINDING);
  const setup = stillNew ? setupNotOnMain({ root: o.root, snap: o.snap, stillNew }) : undefined;
  return setup ? setupMergeReason(setup) : readinessReason(o.findings);
}

/** What blocking readiness findings hold on `snap`'s trail, past the trail lead's Start anyway (readinessChoices.ts). */
export function readinessHold(o: { root: string; snap: MapSnapshot; readiness: RepoReadiness }): ReadinessHold {
  const choice = readinessChoice(o.root, o.snap.map.id);
  const findings = holdingFindings(o.readiness, choice);
  const checks = checksOf(o.root, o.snap);
  const held = readinessHeld({ snap: o.snap, findings, checksOf: checks });
  const waits =
    held.length > 0 || readinessHeld({ snap: o.snap, findings, checksOf: checks, among: 'open' }).length > 0;
  const reason = held.length ? reasonOf({ root: o.root, snap: o.snap, findings }) : undefined;
  return { findings, held, waits, ...(reason ? { reason } : {}), ...(choice ? { startedAnyway: choice } : {}) };
}
