import { type MapSnapshot, trailProgress } from '@teamtrail/core';
import { Badge } from '../../components/ui';

/** One trail in the switcher: key, title, progress and what waits on the trail lead there. */
export function TrailItem(props: { snap: MapSnapshot; on: boolean; waiting: number; onSelect: () => void }) {
  const { map } = props.snap;
  const p = trailProgress(props.snap);
  return (
    <button
      role="menuitem"
      className={`trail-item ${props.on ? 'on' : ''} ${map.archived ? 'archived' : ''}`}
      onClick={props.onSelect}
    >
      <span className="key">{map.key}</span>
      <span className="mi-title">{map.title}</span>
      <span className="mi-progress">
        {p.decided}/{p.total}
      </span>
      <Badge n={props.waiting} urgent={!!props.waiting} hideZero />
    </button>
  );
}
