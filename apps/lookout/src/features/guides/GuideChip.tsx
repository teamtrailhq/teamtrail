import { cx } from '../../lib';
import { useGuides } from './useGuides';

/** The guide a ticket asks for. Quietly marked when agents can't use it now (not approved, changed, invalid). */
export function GuideChip(props: { id: string }) {
  const { view, find } = useGuides();
  const r = find(props.id);
  const off = view !== undefined && view !== null && r?.status !== 'active';
  const name = r?.guide?.name ?? props.id;
  const tip = off ? `${name}: ${r?.reason ?? 'not installed'}` : `Guide: ${name}`;
  return (
    <span className={cx('guide-chip', off && 'off')} data-guide-id={props.id} title={tip}>
      {name}
    </span>
  );
}
