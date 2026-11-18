import { journalFile } from '../history/journalFile';
import type { GateEntry, GateLog } from '../model/gateMode';

const DAY = 24 * 60 * 60 * 1000;
/** How far back Settings → This trail → Gates looks at what the gates did. */
const GATE_LOG_DAYS = 14;
/** Enough for any page; a gate firing more than this in two weeks says so through its counts anyway. */
const MAX_ENTRIES = 500;

const wellFormed = (e: GateEntry) =>
  typeof e.gate === 'string' &&
  typeof e.at === 'number' &&
  typeof e.reason === 'string' &&
  (e.mode === 'enforce' || e.mode === 'observe');

/** The gate entries of every trail in `mapIds` from the last `GATE_LOG_DAYS`, newest first, at most 500. */
export function readGateLog(o: { root: string; mapIds: string[]; now?: number }): GateLog {
  const since = (o.now ?? Date.now()) - GATE_LOG_DAYS * DAY;
  const journal = journalFile(o.root);
  const entries = o.mapIds
    .flatMap((id) => journal.readGates(id))
    .filter((e) => wellFormed(e) && e.at >= since)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ENTRIES);
  return { since, days: GATE_LOG_DAYS, entries };
}
