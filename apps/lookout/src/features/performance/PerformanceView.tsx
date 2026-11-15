import { performanceReport } from '@teamtrail/core';
import { useEffect, useMemo, useState } from 'react';
import { Choice, Empty, Label, MetaLine, Panel } from '../../components/ui';
import type { Breakpoint, LookoutApi } from '../../hooks';
import { PerformanceRows } from './PerformanceRows';
import { ScorecardSection } from './ScorecardSection';
import { useAllJournals } from './useAllJournals';

type Group = 'byVendor' | 'byAgent' | 'byType';
const GROUPS: { id: Group; title: string }[] = [
  { id: 'byVendor', title: 'By vendor' },
  { id: 'byAgent', title: 'By agent' },
  { id: 'byType', title: 'By ticket type' },
];

/** Delivery across every trail, by vendor, agent and ticket type. Covers the zones under the header, like the Logbook. */
export function PerformanceView({ api, bp, onClose }: { api: LookoutApi; bp: Breakpoint; onClose: () => void }) {
  const [group, setGroup] = useState<Group>('byVendor');
  const snaps = useMemo(() => Object.values(api.allSnaps), [api.allSnaps]);
  const journals = useAllJournals(snaps);
  const answered = api.activity.answered;
  const report = useMemo(
    () => performanceReport(snaps.map((snap) => ({ snap, journal: journals[snap.map.id] ?? [], answered }))),
    [snaps, journals, answered],
  );
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <Panel className={`zone decisions-view perf-view dv-${bp}`}>
      <header className="dv-head">
        <Label as="h2">Trail stats</Label>
        <MetaLine parts={[`${report.trails} trails`, `${report.tickets} tickets`]} />
        <span className="dv-head-right">
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </span>
      </header>
      <div className="perf-body">
        <section className="perf-section">
          <Label as="h3">What stands out</Label>
          <p className="perf-note t-meta">
            From your own numbers, for you to act on or ignore. Teamtrail doesn&apos;t route work from these.
          </p>
          {report.recommendations.length ? (
            <ul className="perf-recs">
              {report.recommendations.map((r) => (
                <li key={r.id} title={r.because}>
                  <span>{r.text}</span>
                  <span className="t-meta">{r.because}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing yet. This needs at least 5 results from two vendors to compare.</Empty>
          )}
        </section>
        <ScorecardSection />
        <section className="perf-section">
          <div className="choice-row compact">
            {GROUPS.map((g) => (
              <Choice key={g.id} on={group === g.id} title={g.title} onClick={() => setGroup(g.id)} />
            ))}
          </div>
          <PerformanceRows rows={report[group]} />
          <p className="perf-note t-meta">Spend is tracked per trail, so it isn&apos;t split by agent here.</p>
        </section>
      </div>
    </Panel>
  );
}
