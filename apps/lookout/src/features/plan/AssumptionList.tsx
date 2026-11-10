import type { MapSnapshot } from '@teamtrail/core';
import { Empty } from '../../components/ui';
import type { Selection } from '../../lib';
import { AssumptionRow } from './AssumptionRow';
import { useConfirmAssumption } from './useConfirmAssumption';

/**
 * The trail's assumptions: what the plan relies on, seeded from the accepted discovery brief or listed when the
 * trail started. Agents challenge them with evidence; holding and challenged ones the trail lead can confirm.
 */
export function AssumptionList({ snap, onSelect }: { snap: MapSnapshot; onSelect: (s: Selection) => void }) {
  const { confirm, busy, error } = useConfirmAssumption(snap.map.id);
  const all = snap.map.sections.assumptions ?? [];
  if (!all.length) return <Empty>None yet. They come from the accepted discovery brief or the trail's start.</Empty>;
  return (
    <>
      {error && <p className="urgent-text">{error}</p>}
      <ul className="assumptions row-list">
        {all.map((a) => {
          const open = a.status === 'holding' || a.status === 'challenged';
          return (
            <AssumptionRow
              key={a.id}
              a={a}
              snap={snap}
              onSelect={onSelect}
              onConfirm={open ? () => void confirm(a.id, a.text) : undefined}
              busy={busy === a.id}
            />
          );
        })}
      </ul>
    </>
  );
}
