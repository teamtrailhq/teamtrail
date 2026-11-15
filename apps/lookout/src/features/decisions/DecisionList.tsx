import type { DecisionRecord, MapSnapshot } from '@teamtrail/core';
import { Empty } from '../../components/ui';
import { day } from '../../lib';
import { areaGroups } from './areaGroups';
import { DecisionRow } from './DecisionRow';
import type { DecisionMemory } from './useDecisionMemory';

/** The filtered decisions, newest first, with a day divider whenever the date changes. */
export function DecisionList(props: {
  rows: DecisionRecord[];
  current?: DecisionRecord;
  snaps: Record<string, MapSnapshot>;
  showTrail: boolean;
  onSelect: (id: string) => void;
  /** Group by area, most cited first, instead of by day. */
  memory?: DecisionMemory;
}) {
  const { rows, current, memory } = props;
  const row = (d: DecisionRecord, newDay: boolean, group?: string) => (
    <DecisionRow
      key={`${d.mapId}:${d.id}`}
      d={d}
      newDay={newDay}
      group={group}
      cited={memory?.[`${d.mapId}/${d.id}`]?.citedBy.length}
      trail={props.snaps[d.mapId]?.map.key}
      on={current?.id === d.id && current.mapId === d.mapId}
      showTrail={props.showTrail}
      onClick={() => props.onSelect(d.id)}
    />
  );
  if (memory && rows.length)
    return (
      <ol className="dv-list" aria-label="Logbook by area">
        {areaGroups(rows, memory).flatMap((g) => g.rows.map((d, i) => row(d, i === 0, `${g.area} · ${g.rows.length}`)))}
      </ol>
    );
  return (
    <ol className="dv-list" aria-label="Logbook">
      {rows.length ? (
        rows.map((d, i) => row(d, i === 0 || day(rows[i - 1].decidedAt) !== day(d.decidedAt)))
      ) : (
        <Empty>No decisions</Empty>
      )}
    </ol>
  );
}
