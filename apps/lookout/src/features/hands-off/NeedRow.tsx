import type { AttentionItem } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Button, LabelLine, Row } from '../../components/ui';
import { cx } from '../../lib';
import { edgeFor } from '../attention';
import { NeedBody } from './NeedBody';
import { needDetail, needLabel, needText } from './needText';
import type { NeedContext, NeedText } from './types';

/**
 * One thing that needs you, in the scenes' row: a label line (its kind, the ticket, who asks, how long), what it asks
 * as the title (two lines at most), one line more (the rest of the question, or why it ranks here) and its one action
 * on the right, rose only when it needs you now. Open, it shows what to decide in place, its choices and the way to
 * the full ticket; its action opens it too, so every choice is made where it can be read.
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
  const detail = props.open ? undefined : needDetail(item, q);
  return (
    <Row
      as="li"
      className={cx('home-need', props.open && 'open')}
      edge={edge}
      selected={props.open}
      label={
        <LabelLine
          className="home-need-label"
          parts={[
            { text: text.chip, className: 'home-chip' },
            ...needLabel({ item, snap, current: ctx.api.mapId, now: ctx.now }),
          ]}
        />
      }
      title={<span className="home-need-title">{text.title}</span>}
      titleText={item.title}
      detail={detail}
      detailText={detail}
      onOpen={props.onToggle}
      action={
        <Button
          variant={urgent && !props.open ? 'urgent' : 'default'}
          aria-expanded={props.open}
          onClick={props.onToggle}
        >
          {props.open ? 'Close' : text.quick}
        </Button>
      }
      below={props.open && <div className="home-need-body">{props.body ?? <NeedBody item={item} ctx={ctx} />}</div>}
    />
  );
}
