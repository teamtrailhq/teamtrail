import { cx } from '../../lib';
import { useGuides } from './useGuides';

/** A ticket's guide on its map sign, above the board; quietly marked when agents can't use it now. */
export function GuideNodeTag(props: { id: string }) {
  const { view, find } = useGuides();
  const r = find(props.id);
  const off = view !== undefined && view !== null && r?.status !== 'active';
  return (
    <text className={cx('guide-chip', 'guide-tag', off && 'off')} data-guide-id={props.id} x={2} y={-5}>
      <title>{off ? `${props.id}: ${r?.reason ?? 'not installed'}` : `Guide: ${r?.guide?.name ?? props.id}`}</title>
      {r?.guide?.name ?? props.id}
    </text>
  );
}
