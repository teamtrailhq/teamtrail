import type { AttentionItem } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Button, MetaLine, Pill, Row } from '../../components/ui';
import { cx } from '../../lib';
import { edgeFor } from '../attention';
import { NeedBody } from './NeedBody';
import { needMeta, needText } from './needText';
import type { NeedContext, NeedText } from './types';

/**
 * One thing that needs you: its kind (red only when it needs you now), what it asks with the ticket and its wait,
 * and its action, in columns (chip | title over its meta line | action) that keep every line inside the card. Open, it shows what to decide in place, its choices and the way to the full ticket; its action
 * opens it too, so every choice is made where it can be read.
 */
export function NeedRow(props: {
  item: AttentionItem;
  ctx: NeedContext;
  open: boolean;
  onToggle: () => void;
  /** Words that say more than the kind (the plan), and the body that goes with them. */
  text?: NeedText;
  body?: ReactNode;
}) {
  const { item, ctx } = props;
  const snap = ctx.api.allSnaps[item.mapId];
  const q = item.kind === 'question' ? ctx.api.activity.pending.find((p) => p.id === item.ref) : undefined;
  const text = props.text ?? needText(item, q);
  const edge = edgeFor(item, ctx.view.interrupting.includes(item.id));
  const urgent = edge === 'urgent';
  return (
    <Row
      as="li"
      className={cx('home-need', props.open && 'open')}
      edge={edge}
      selected={props.open}
      title={
        <>
          <Pill className={cx('home-chip', urgent && 'urgent')}>{text.chip}</Pill>
          <span className="home-need-title">{text.title}</span>
        </>
      }
      titleText={item.title}
      context={<MetaLine parts={needMeta({ item, snap, current: ctx.api.mapId, now: ctx.now })} />}
      onOpen={props.onToggle}
      actions={
        <Button size="sm" variant={urgent ? 'urgent' : 'default'} aria-expanded={props.open} onClick={props.onToggle}>
          {props.open ? 'Close' : text.quick}
        </Button>
      }
      below={props.open && <div className="home-need-body">{props.body ?? <NeedBody item={item} ctx={ctx} />}</div>}
    />
  );
}
