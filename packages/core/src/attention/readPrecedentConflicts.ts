import type { TrackerAdapter } from '../adapters/adapter';
import type { MapSnapshot } from '../model/types';
import { precedentAreas } from '../precedent/precedentAreas';
import { precedentConflicts, type PrecedentConflict } from '../precedent/precedentConflicts';
import { readAttempts } from '../verification/evidenceStore';

/** The precedent source's input: each ticket's latest attempt, checked against the human's decisions' areas. */
export async function readPrecedentConflicts(input: {
  root: string;
  adapter: TrackerAdapter;
  snaps: MapSnapshot[];
}): Promise<PrecedentConflict[]> {
  const { root, adapter, snaps } = input;
  const attempts = snaps.flatMap((s) => s.tickets.flatMap((t) => readAttempts(root, s.map.id, t.id).slice(-1)));
  if (!attempts.some((a) => a.result === 'pass')) return [];
  const decisions = (await Promise.all(snaps.map((s) => adapter.listDecisions(s.map.id)))).flat();
  return precedentConflicts({ attempts, decisions, areas: precedentAreas(root, decisions) });
}
