import type { ActivityState, MapSnapshot } from '@teamtrail/core';
import { Empty, MetaLine, Row } from '../../components/ui';
import type { Selection } from '../../lib';
import { AssumptionList } from './AssumptionList';
import { splitPlanItem } from './splitPlanItem';
import { TrailReport } from './TrailReport';
import type { Tab } from './types';

/**
 * The open section of the trail plan, or the report. Every section is the same list of rows: a title and, when
 * there is something to add, one quiet context line.
 */
export function PlanTabBody({
  tab,
  snap,
  selection,
  onSelect,
  activity,
}: {
  tab: Tab;
  snap: MapSnapshot;
  selection: Selection;
  onSelect: (s: Selection) => void;
  activity?: ActivityState;
}) {
  const s = snap.map.sections;
  switch (tab) {
    case 'report':
      if (!activity) return <Empty>No activity yet</Empty>;
      return <TrailReport snap={snap} activity={activity} onTicket={(id) => onSelect({ kind: 'ticket', id })} />;
    case 'assumptions':
      return <AssumptionList snap={snap} onSelect={onSelect} />;
    case 'decisions':
      if (!s.decisions.length) return <Empty>None</Empty>;
      return (
        <ol className="row-list decisions">
          {[...s.decisions].reverse().map((d, i) => (
            <Row
              key={`${d.ticketKey}-${i}`}
              as="li"
              title={d.text}
              titleText={d.text}
              context={d.ticketKey && <MetaLine parts={[{ text: d.ticketKey, code: true }]} />}
              onOpen={d.ticketId ? () => onSelect({ kind: 'ticket', id: d.ticketId! }) : undefined}
            />
          ))}
        </ol>
      );
    case 'unspecified':
      if (!s.unspecified.length) return <Empty>None</Empty>;
      return (
        <ul className="row-list unspecified">
          {s.unspecified.map((f) => (
            <Row
              key={f}
              as="li"
              title={f}
              titleText={f}
              selected={selection?.kind === 'unspecified' && selection.item === f}
              onOpen={() => onSelect({ kind: 'unspecified', item: f })}
            />
          ))}
        </ul>
      );
    case 'oos':
      if (!s.outOfScope.length) return <Empty>None</Empty>;
      return (
        <ul className="row-list oos">
          {s.outOfScope.map((o) => {
            const item = splitPlanItem(o);
            return (
              <Row
                key={o}
                as="li"
                title={item.title}
                titleText={o}
                context={<MetaLine parts={[item.key && { text: item.key, code: true }, item.reason]} />}
              />
            );
          })}
        </ul>
      );
    case 'notes':
      return <p className="notes t-body">{s.notes || 'No notes yet.'}</p>;
    default: {
      const unknown: never = tab;
      return unknown;
    }
  }
}
