import type { DecisionRecord, Ticket, TrailBriefing } from '@teamtrail/core';

/** One line of what happened since the person was away, most worth their eye first. */
export type SinceRow =
  | { kind: 'decision'; decision: DecisionRecord }
  | { kind: 'ruled-out'; tickets: Ticket[] }
  | { kind: 'added'; tickets: Ticket[] }
  | { kind: 'done'; ticket: Ticket };

/**
 * The story of a trail since the last visit: decisions agents made themselves first (yours to keep or overrule),
 * then changes to the plan (tickets ruled out, tickets added after it was charted), then finished work, newest first.
 */
export function sinceRows(t: TrailBriefing, chartedAt: number): SinceRow[] {
  const rows: SinceRow[] = t.agentDecisions.map((decision) => ({ kind: 'decision', decision }));
  if (t.ruledOut.length) rows.push({ kind: 'ruled-out', tickets: t.ruledOut });
  const added = t.since > chartedAt ? t.opened : [];
  if (added.length) rows.push({ kind: 'added', tickets: added });
  for (const ticket of [...t.done].reverse()) rows.push({ kind: 'done', ticket });
  return rows;
}
