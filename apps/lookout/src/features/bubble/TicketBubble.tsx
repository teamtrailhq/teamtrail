import type { AttentionView, MapSnapshot, SessionInfo, Ticket } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import type { LookoutApi } from '../../hooks';
import { edgeFor } from '../attention';
import { ActionBar, type Form, TicketForms, useTicketActions, useTicketView } from '../inspector';
import { BubbleTicketPart } from './BubbleTicketPart';
import { ItemNeed } from './ItemNeed';
import { needOf } from './needOf';
import { QuestionNeed } from './QuestionNeed';

/** Where the bubble's actions lead: the full ticket, the conversation, Approvals and the brief. */
export interface TicketBubbleLinks {
  onFullTicket: () => void;
  onOpenChat: (sessionId: string) => void;
  onReviewChange?: () => void;
  onReviewBrief?: (mapId: string) => void;
}

/**
 * A ticket's bubble: first what it needs from you, with its actions in place (the agent's question answered here,
 * the queue item's next action), then the ticket. `onUrgent` tells the frame whether to edge it red.
 */
export function TicketBubble(
  props: TicketBubbleLinks & {
    snap: MapSnapshot;
    t: Ticket;
    api: LookoutApi;
    sessions: SessionInfo[];
    attention?: AttentionView;
    onUrgent: (urgent: boolean) => void;
  },
) {
  const { api, t } = props;
  const v = useTicketView({ snap: props.snap, t, api, sessions: props.sessions, attention: props.attention });
  const [form, setForm] = useState<Form>(null);
  const bar = useTicketActions({
    v,
    api,
    setForm,
    onEditHow: props.onFullTicket,
    onOpenChat: props.onOpenChat,
    onReviewChange: props.onReviewChange,
    onReviewBrief: props.onReviewBrief,
  });
  const need = needOf({
    questionId: v.question?.id,
    items: v.items,
    urgentOf: (i) => edgeFor(i, v.interrupting.includes(i.id)) === 'urgent',
  });
  const urgent = need.kind === 'question' || (need.kind === 'item' && need.urgent);
  const { onUrgent } = props;
  useEffect(() => onUrgent(urgent), [urgent, onUrgent]);
  const asked = need.kind === 'question';
  const shownBar = asked && bar.primary?.id === 'answer' ? { ...bar, primary: undefined } : bar;
  const actions = (
    <>
      <ActionBar v={v} bar={shownBar} onOpenChat={props.onOpenChat} />
      <TicketForms form={form} setForm={setForm} v={v} actions={api.actions} act={bar.act} waive={bar.waive} />
    </>
  );
  const keyOf = (id: string) => props.snap.tickets.find((x) => x.id === id)?.key;
  const pr = v.pr?.pr && { number: v.pr.pr.number, url: v.pr.pr.url };
  return (
    <>
      {asked && v.question && (
        <QuestionNeed
          q={v.question}
          now={v.now}
          keyOf={keyOf}
          onAnswer={api.actions.answer}
          onOpenChat={props.onOpenChat}
        />
      )}
      {need.kind === 'item' && <ItemNeed need={need} now={v.now} pr={pr} actions={actions} />}
      <BubbleTicketPart v={v} under={need.kind !== 'none'} onFullTicket={props.onFullTicket} />
      {need.kind !== 'item' && actions}
    </>
  );
}
