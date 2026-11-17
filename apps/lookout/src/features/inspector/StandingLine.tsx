import { leaseHealth } from '@teamtrail/core';
import { ChangedNotice, MetaLine } from '../../components/ui';
import { cx } from '../../lib';
import type { TicketView } from './useTicketView';

/**
 * Where the ticket stands, in plain words, with who it waits on and since when; under it, one line for each other
 * thing that holds it up or puts it at risk, and a notice when criteria changed while the human read them.
 */
export function StandingLine({ v }: { v: TicketView }) {
  const s = v.standing;
  const health = v.lease && leaseHealth(v.lease, v.now);
  const changed = v.criteria.changed ?? v.criteria.proposalChanged;
  return (
    <div
      className={cx(
        'standing edge-note',
        `edge-${s.edge}`,
        `st-${v.state}`,
        health && `lease-${health}`,
        v.modelWait && 'model-wait',
      )}
    >
      <span className="t-row-title standing-title">{s.title}</span>
      <MetaLine parts={s.parts} />
      {v.notices.map((n) => (
        <span key={n.text} className="t-meta standing-notice">
          {n.text}
        </span>
      ))}
      {changed && <ChangedNotice what="The criteria" onReviewAgain={changed.reviewAgain} />}
    </div>
  );
}
