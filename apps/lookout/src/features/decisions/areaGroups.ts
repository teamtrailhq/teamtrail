import { NO_AREA, type DecisionRecord } from '@teamtrail/core';
import type { DecisionMemory } from './useDecisionMemory';

const keyOf = (d: DecisionRecord) => `${d.mapId}/${d.id}`;

/**
 * The decisions grouped by area, biggest area first and "No area yet" last; inside each, the most cited first, then
 * the newest. Superseded decisions stay, marked by their row.
 */
export function areaGroups(rows: DecisionRecord[], memory: DecisionMemory) {
  const groups = new Map<string, DecisionRecord[]>();
  for (const d of rows) {
    const area = memory[keyOf(d)]?.area ?? NO_AREA;
    groups.set(area, [...(groups.get(area) ?? []), d]);
  }
  const cited = (d: DecisionRecord) => memory[keyOf(d)]?.citedBy.length ?? 0;
  return [...groups]
    .map(([area, list]) => ({ area, rows: [...list].sort((a, b) => cited(b) - cited(a) || b.decidedAt - a.decidedAt) }))
    .sort(
      (a, b) =>
        Number(a.area === NO_AREA) - Number(b.area === NO_AREA) ||
        b.rows.length - a.rows.length ||
        a.area.localeCompare(b.area),
    );
}
