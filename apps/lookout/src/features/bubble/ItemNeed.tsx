import { webUrl } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { ago } from '../../lib';
import { detailReasons } from '../attention';
import type { BubbleNeed } from './needOf';

/**
 * What the queue holds on the ticket, at the top of its bubble, under the bar that names it: what to do as the
 * headline, why it ranks (its reasons) and how long it has waited and, for a pull request ready to merge, a link to
 * it. The ticket's actions are at the bubble's end.
 */
export function ItemNeed(props: {
  need: Extract<BubbleNeed, { kind: 'item' }>;
  now: number;
  pr?: { number: number; url: string };
}) {
  const { need, pr } = props;
  const reasons = detailReasons(need.item);
  const url = pr && webUrl(pr.url);
  return (
    <div className="bubble-need">
      <h3 className="bubble-title">{need.title}</h3>
      <MetaLine parts={[...reasons, ago(props.now - need.item.since)]} />
      {need.item.kind === 'merge' && pr && url && (
        <a className="link" href={url} target="_blank" rel="noreferrer">
          Open PR #{pr.number}
        </a>
      )}
    </div>
  );
}
