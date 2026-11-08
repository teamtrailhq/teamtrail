import {
  durationLabel,
  performanceReport,
  type AnsweredQuestion,
  type MapSnapshot,
  type TicketType,
} from '@teamtrail/core';
import { useMemo } from 'react';
import { useAllJournals } from '../performance';

/**
 * What Trail stats measured per ticket type, as one plain line each, for the trail lead setting tiers. Information
 * only: nothing here changes a tier.
 */
export function useTypeHints(snaps: MapSnapshot[], answered: AnsweredQuestion[]): Partial<Record<TicketType, string>> {
  const journals = useAllJournals(snaps);
  return useMemo(() => {
    const report = performanceReport(snaps.map((snap) => ({ snap, journal: journals[snap.map.id] ?? [], answered })));
    const hints: Partial<Record<TicketType, string>> = {};
    for (const row of report.byType) {
      if (!row.done) continue;
      const speed = report.recommendations.find((r) => r.id === `speed-${row.key}`)?.text;
      const parts = [
        `Trail stats: ${row.done} done`,
        row.medianLeadMs !== undefined && `median ${durationLabel(row.medianLeadMs)}`,
        row.reworkCycles > 0 && `${row.reworkCycles} back to rework`,
        speed,
      ];
      hints[row.key as TicketType] = parts.filter(Boolean).join(' · ');
    }
    return hints;
  }, [snaps, journals, answered]);
}
