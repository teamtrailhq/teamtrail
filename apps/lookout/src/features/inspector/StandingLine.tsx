import { leaseHealth } from '@teamtrail/core';
import { ChangedNotice, Clamp, MetaLine } from '../../components/ui';
import { cx } from '../../lib';
import type { TicketView } from './useTicketView';

/**
 * Where the ticket stands, in plain words, with who it waits on and since when; under it, one line for each other
 * thing that holds it up or puts it at risk, and a notice when criteria changed while the human read them. It says
 * nothing a chip already says ("Done", "verified"). In the bubble, `asked` leaves the state out when the top already
 * asks the same, and `shownItem` the notice the top already gives.
 */
export function StandingLine(props: { v: TicketView; className?: string; asked?: boolean; shownItem?: string }) {
  const { v } = props;
  const s = v.standing;
  const health = v.lease && leaseHealth(v.lease, v.now);
  const changed = v.criteria.changed ?? v.criteria.proposalChanged;
  const chipped = new Set(v.chips.map((c) => c.text.toLowerCase()));
  const title = props.asked || chipped.has(s.title.toLowerCase()) ? undefined : s.title;
  const parts = props.asked ? [] : s.parts.filter((p) => !chipped.has(p.toLowerCase()));
  const notices = v.notices.filter((n) => n.text !== props.shownItem);
  if (!title && !parts.length && !notices.length && !changed) return null;
  return (
    <div
      className={cx(
        'standing edge-note',
        `edge-${s.edge}`,
        `st-${v.state}`,
        health && `lease-${health}`,
        v.modelWait && 'model-wait',
        props.className,
      )}
    >
      {title && <span className="t-row-title standing-title state-title">{title}</span>}
      <MetaLine parts={parts} />
      {title && s.body && <Clamp key={s.body} text={s.body} markdown className="question-body" />}
      {notices.map((n) => (
        <span key={n.text} className="t-meta standing-notice">
          {n.text}
        </span>
      ))}
      {changed && <ChangedNotice what="The criteria" onReviewAgain={changed.reviewAgain} />}
    </div>
  );
}
