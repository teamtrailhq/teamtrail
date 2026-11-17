import { leaseHealth } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { cx, TYPE_TEXT } from '../../lib';
import { WhatSection, type TicketView } from '../inspector';
import { AgentLine } from './AgentLine';

/**
 * The ticket in the bubble, under what it needs from you: its key and type, its title, where it stands (and the
 * agent on it, with its model and step), what it asks and what "done" means. Everything else is in the full ticket.
 */
export function BubbleTicketPart(props: { v: TicketView; under: boolean; onFullTicket: () => void }) {
  const { v } = props;
  const s = v.standing;
  const health = v.lease && leaseHealth(v.lease, v.now);
  return (
    <div className={cx('bubble-ticket', props.under && 'under')}>
      <span className="t-label">
        <span className="t-code">{v.t.key}</span> · {TYPE_TEXT[v.t.type]}
      </span>
      <h3 className={cx('bubble-title', props.under && 'small')}>{v.t.title}</h3>
      <div className={cx('bubble-state', `edge-${s.edge}`, health && `lease-${health}`, v.modelWait && 'model-wait')}>
        <span className="state-title">{s.title}</span>
        <MetaLine parts={s.parts} />
      </div>
      {v.notices.map((n) => (
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
