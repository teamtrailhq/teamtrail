import { GATE_NAMES, type GateEntry } from '@teamtrail/core';
import type { GateSummary } from './types';

/** Tickets counted once each; an entry about no ticket counts on its own. */
function distinct(entries: GateEntry[]) {
  return new Set(entries.map((e, i) => (e.ticketId ? `${e.mapId}/${e.ticketId}` : `#${i}`))).size;
}

/**
 * Each gate's tickets held and would-have-held, newest entries first: every known gate (with nothing, too), then any
 * other gate the journal names, in the order first seen. Pure.
 */
export function summarizeGates(entries: GateEntry[]): GateSummary[] {
  const newest = [...entries].sort((a, b) => b.at - a.at);
  const names: string[] = [...GATE_NAMES];
  for (const e of newest) if (!names.includes(e.gate)) names.push(e.gate);
  return names.map((gate) => {
    const mine = newest.filter((e) => e.gate === gate);
    return {
      gate,
      held: distinct(mine.filter((e) => e.mode === 'enforce')),
      wouldHold: distinct(mine.filter((e) => e.mode === 'observe')),
      entries: mine,
    };
  });
}
