import type { AttentionItem, MapSnapshot, Ticket } from '@teamtrail/core';
import { useState } from 'react';
import { openItem } from '../attention';
import { CriteriaList } from '../criteria';
import { type Form, TicketFooter, useTicketActions, useTicketView } from '../inspector';
import { needWhy } from './needText';
import { NeedWhy } from './NeedWhy';
import type { NeedContext } from './types';

/**
 * What a ticket on the trail on screen needs, in place: why it ranks here in one line, then the ticket's own actions
 * as its bubble and the full ticket have them (the next one first, the rest under "⋯", the form an action opens),
 * with the same guards, and Open ticket for everything else.
 */
export function TicketNeedBody(props: { item: AttentionItem; snap: MapSnapshot; t: Ticket; ctx: NeedContext }) {
  const { ctx, t } = props;
  const { api, handlers } = ctx;
  const v = useTicketView({ snap: props.snap, t, api, sessions: ctx.sessions, attention: ctx.view });
  const [form, setForm] = useState<Form>(null);
  const open = () => ctx.openTicket(props.snap.map.id, t.id);
  const bar = useTicketActions({
    v,
    api,
    setForm,
    onEditHow: open,
    onOpenChat: ctx.openChat,
    onReviewChange: handlers.openApprovals,
    onReviewBrief: handlers.openBrief,
    onItem: (i) => openItem(i, handlers),
    onDismiss: ctx.dismiss,
  });
  return (
    <>
      <NeedWhy parts={needWhy(props.item, t)} />
      {props.item.kind === 'criteria' && <CriteriaList criteria={v.criteria.criteria} />}
      <TicketFooter
        v={v}
        bar={bar}
        form={form}
        setForm={setForm}
        actions={api.actions}
        onOpenChat={ctx.openChat}
        className="home-ticket-footer"
        trailing={
          <button type="button" className="link" onClick={open}>
            Open ticket
          </button>
        }
      />
    </>
  );
}
