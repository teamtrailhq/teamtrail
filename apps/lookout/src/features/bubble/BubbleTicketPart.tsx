import { leaseHealth } from '@teamtrail/core';
import { cx } from '../../lib';
import { CriteriaSection, StandingLine, TicketHead, WhatSection, type TicketView } from '../inspector';
import { AgentLine } from './AgentLine';

/**
 * The ticket in the bubble, under what it needs from you, in the full ticket's anatomy cut to the essentials: its
 * title and chips, where it stands (and the agent's step), what it asks and what "done" means. Everything else is in
 * the full ticket. Under a needs-you part it says nothing twice: no title when the top already names the ticket, no
 * state line when that line is the same ask (answer, approve, decide, unblock…), no notice the top already gives.
 */
export function BubbleTicketPart(props: {
  v: TicketView;
  /** What the top of the bubble says, when it has a needs-you part: its title (or the question), and the item. */
  need?: { text: string; item?: string };
}) {
  const { v, need } = props;
  const health = v.lease && leaseHealth(v.lease, v.now);
  const named = !!need && need.text.toLowerCase().includes(v.t.title.toLowerCase());
  const asks = !!need && !!v.standing.primary;
  return (
    <div className={cx('bubble-ticket', need && 'under', health && `lease-${health}`, v.modelWait && 'model-wait')}>
      <TicketHead v={v} titled={!named} small={!!need} />
      <StandingLine v={v} className="bubble-state" asked={asks} shownItem={need?.item} />
      {v.session && <AgentLine session={v.session} />}
      <WhatSection v={v} />
      <CriteriaSection v={v} />
    </div>
  );
}
