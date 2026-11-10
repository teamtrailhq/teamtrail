import { isDismissable, type AttentionItem, type MapSnapshot } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { ago } from '../../lib';
import { ItemAction } from './ItemAction';
import { ReasonLine } from './ReasonLine';
import { contextParts, detailReasons, edgeFor } from './rowText';
import { SnoozeMenu } from './SnoozeMenu';

/** How long a new item's edge pulses, so it's noticed without a tag. */
const INCOMING_MS = 15_000;

/**
 * One thing that needs the human, in the three levels: what (title), where and who (context), why it ranks here
 * (detail). The edge says how urgent it is; "Later" appears on hover or focus.
 */
export function AttentionItemRow(props: {
  item: AttentionItem;
  snap?: MapSnapshot;
  /** The item belongs to a trail other than the one on screen. */
  otherTrail: boolean;
  selected: boolean;
  interrupting: boolean;
  now: number;
  onOpen: () => void;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
}) {
  const { item } = props;
  const title = item.title.split('\n')[0];
  const reasons = detailReasons(item);
  const incoming = props.now - item.since < INCOMING_MS;
  return (
    <Row
      as="li"
      className={`att-item k-${item.kind} u-${item.urgency} ${props.selected ? 'sel' : ''} ${incoming ? 'incoming' : ''}`}
      edge={edgeFor(item, props.interrupting)}
      selected={props.selected}
      title={title}
      titleText={item.title}
      context={<MetaLine parts={contextParts({ item, snap: props.snap, otherTrail: props.otherTrail })} />}
      detail={reasons.length > 0 && <ReasonLine reasons={reasons} />}
      detailText={reasons.join('\n')}
      trailing={ago(props.now - item.since)}
      onOpen={props.onOpen}
      actions={
        <SnoozeMenu
          title={item.title}
          canDismiss={isDismissable(item)}
          onSnooze={props.onSnooze}
          onDismiss={props.onDismiss}
        />
      }
      below={<ItemAction item={item} />}
    />
  );
}
