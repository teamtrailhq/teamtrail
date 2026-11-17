import { webUrl } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { MetaLine } from '../../components/ui';
import { ago, cx } from '../../lib';
import { detailReasons } from '../attention';
import type { BubbleNeed } from './needOf';

/**
 * What the queue holds on the ticket, at the top of its bubble: a label, what to do in one line, why it ranks
 * (its reasons) and how long it has waited, then the ticket's actions in place (`actions`) and, for a pull request
 * ready to merge, a link to it.
 */
export function ItemNeed(props: {
  need: Extract<BubbleNeed, { kind: 'item' }>;
  now: number;
  pr?: { number: number; url: string };
  actions: ReactNode;
}) {
  const { need, pr } = props;
  const reasons = detailReasons(need.item);
  const url = pr && webUrl(pr.url);
  return (
    <div className="bubble-need">
      <span className={cx('t-label', need.urgent && 'urgent')}>{need.label}</span>
      <h3 className="bubble-title">{need.title}</h3>
      <MetaLine parts={[...reasons, ago(props.now - need.item.since)]} />
      {props.actions}
      {need.item.kind === 'merge' && pr && url && (
        <a className="link" href={url} target="_blank" rel="noreferrer">
          Open PR #{pr.number}
        </a>
      )}
    </div>
  );
}
