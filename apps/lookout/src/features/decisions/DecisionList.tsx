import type { AuditDecision, MapSnapshot } from '@teamtrail/core';
import { Empty, LabelLine } from '../../components/ui';
import { day } from '../../lib';
import { areaGroups } from './areaGroups';
import { DecisionRow } from './DecisionRow';
import { keptKey } from './keptKey';
import type { DecisionMemory } from './useDecisionMemory';

/** The ledger: the filtered decisions, newest first, with a day divider whenever the date changes, or by area. */
export function DecisionList(props: {
  rows: AuditDecision[];
  current?: AuditDecision;
  snaps: Record<string, MapSnapshot>;
  showTrail: boolean;
  onSelect: (id: string) => void;
  /** Agents' calls this person kept, by `keptKey`: marked "kept by you". */
  kept: (key: string) => boolean;
  /** Whether "Agents decided" leads the page, so the ledger says what it is. */
  titled: boolean;
  /** Group by area, most cited first, instead of by day. */
  memory?: DecisionMemory;
}) {
  const { rows, current, memory } = props;
  const row = (d: AuditDecision, newDay: boolean, group?: string) => (
    <DecisionRow
      key={keptKey(d)}
      d={d}
      newDay={newDay}
      group={group}
      cited={memory?.[keptKey(d)]?.citedBy.length}
      trail={props.snaps[d.mapId]?.map.key}
      on={current?.id === d.id && current.mapId === d.mapId}
      showTrail={props.showTrail}
      kept={props.kept(keptKey(d))}
      onClick={() => props.onSelect(d.id)}
      onSelect={props.onSelect}
    />
  );
  const title = props.titled && (
    <LabelLine as="h3" className="dv-sec-label" parts={['Ledger', memory ? 'by area' : 'newest first']} />
  );
  if (memory && rows.length)
    return (
      <section className="dv-ledger">
        {title}
        <ol className="dv-list" aria-label="Logbook by area">
          {areaGroups(rows, memory).flatMap((g) =>
            g.rows.map((d, i) => row(d, i === 0, `${g.area} · ${g.rows.length}`)),
          )}
        </ol>
      </section>
    );
  return (
    <section className="dv-ledger">
      {title}
      <ol className="dv-list" aria-label="Logbook">
        {rows.length ? (
          rows.map((d, i) => row(d, i === 0 || day(rows[i - 1].decidedAt) !== day(d.decidedAt)))
        ) : (
          <Empty>No decisions</Empty>
        )}
      </ol>
    </section>
  );
}
