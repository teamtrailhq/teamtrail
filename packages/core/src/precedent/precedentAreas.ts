import type { DecisionRecord } from '../model/types';
import { readAttempts } from '../verification/evidenceStore';

/**
 * Each decision's area: the files its ticket changed in its latest passing completion, as git saw them when Teamtrail
 * checked the work. Keyed `<mapId>/<decision id>`; decisions with no ticket or no verified work have none.
 */
export function precedentAreas(root: string, decisions: DecisionRecord[]): Map<string, string[]> {
  const areas = new Map<string, string[]>();
  const byTicket = new Map<string, string[]>();
  for (const d of decisions) {
    if (!d.ticketId) continue;
    const key = `${d.mapId}/${d.ticketId}`;
    if (!byTicket.has(key)) {
      const pass = readAttempts(root, d.mapId, d.ticketId)
        .filter((a) => a.result === 'pass')
        .at(-1);
      byTicket.set(key, pass?.git?.changed.map((c) => c.path) ?? []);
    }
    const files = byTicket.get(key)!;
    if (files.length) areas.set(`${d.mapId}/${d.id}`, files);
  }
  return areas;
}
