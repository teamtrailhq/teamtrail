import { leaseHealth } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { cx, TYPE_TEXT } from '../../lib';
import { WhatSection, type TicketView } from '../inspector';
import { AgentLine } from './AgentLine';

/**
 * The ticket in the bubble, under what it needs from you: its key and type, its title, where it stands (and the
 * agent on it, with its model and step), what it asks and what "done" means. Everything else is in the full ticket.
 * Under a needs-you part it says nothing twice: no title when the top already names the ticket, no state line when
 * that line is the same ask (answer, approve, decide, unblock…), no notice the top already gives.
 */
export function BubbleTicketPart(props: {
  v: TicketView;
  /** What the top of the bubble says, when it has a needs-you part: its title (or the question), and the item. */
  need?: { text: string; item?: string };
  onFullTicket: () => void;
}) {
  const { v, need } = props;
  const s = v.standing;
  const health = v.lease && leaseHealth(v.lease, v.now);
  const named = !!need && need.text.toLowerCase().includes(v.t.title.toLowerCase());
  const asks = !!need && !!s.primary;
  return (
    <div className={cx('bubble-ticket', need && 'under', health && `lease-${health}`, v.modelWait && 'model-wait')}>
      <span className="t-label">
        <span className="t-code">{v.t.key}</span> · {TYPE_TEXT[v.t.type]}
      </span>
      {!named && <h3 className={cx('bubble-title', need && 'small')}>{v.t.title}</h3>}
      {!asks && (
        <div className={cx('bubble-state', `edge-${s.edge}`)}>
          <span className="state-title">{s.title}</span>
          <MetaLine parts={s.parts} />
        </div>
      )}
      {v.notices
        .filter((n) => n.text !== need?.item)
        .map((n) => (
          <span key={n.text} className="t-meta bubble-notice">
            {n.text}
          </span>
        ))}
      {v.session && <AgentLine session={v.session} />}
      <WhatSection v={v} />
      <button type="button" className="link full-ticket" onClick={props.onFullTicket}>
        Full ticket
      </button>
    </div>
  );
}
