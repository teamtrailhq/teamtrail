import type { AttentionItem } from '@teamtrail/core';
import { cx } from '../../lib';
import { needLabel } from '../attention';

/** One chip per thing on the trail that needs you, most urgent first; a click opens it. */
export function NeedChips(props: {
  items: AttentionItem[];
  keyOf: (ticketId: string) => string | undefined;
  selected?: string;
  onOpen: (item: AttentionItem) => void;
  onMore: () => void;
  /** How many chips fit beside the bar before the rest go behind More. */
  max: number;
}) {
  const shown = props.items.slice(0, props.max);
  const rest = props.items.length - shown.length;
  if (!shown.length) return null;
  return (
    <span className="need-chips">
      {shown.map((item) => (
        <button
          key={item.id}
          type="button"
          className={cx('need-chip', props.selected === item.id && 'on')}
          title={item.title}
          onClick={() => props.onOpen(item)}
        >
          {needLabel(item, props.keyOf)}
        </button>
      ))}
      {rest > 0 && (
        <button type="button" className="need-chip more" onClick={props.onMore}>
          +{rest}
        </button>
      )}
    </span>
  );
}
