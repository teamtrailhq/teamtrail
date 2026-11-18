import type { AttentionItem, AttentionView, MapSnapshot, SessionInfo, Ticket } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import type { LookoutApi } from '../../hooks';
import { edgeFor } from '../attention';
import { type Form, TicketFooter, useTicketActions, useTicketView } from '../inspector';
import { BubbleTicketPart } from './BubbleTicketPart';
import { ItemNeed } from './ItemNeed';
import { type BubbleNeed, needOf } from './needOf';
import { QuestionNeed } from './QuestionNeed';

/** Where the bubble's actions lead: the full ticket, the conversation, Approvals and the brief. */
export interface TicketBubbleLinks {
  onFullTicket: () => void;
  onOpenChat: (sessionId: string) => void;
  onReviewChange?: () => void;
  onReviewBrief?: (mapId: string) => void;
  /** Opens a queue item where it is handled; sets one aside. */
  onItem?: (item: AttentionItem) => void;
  onDismiss?: (id: string) => void;
}

/**
 * A ticket's bubble: first what it needs from you (the agent's question, answered here, or the queue's item), then
 * the ticket in the full ticket's anatomy, cut to the essentials, and its actions at the end, the way to the full
 * ticket last. `onUrgent` tells the frame whether to edge it red.
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
    onItem: props.onItem,
    onDismiss: props.onDismiss,
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
      {need.kind === 'item' && <ItemNeed need={need} now={v.now} pr={pr} />}
      <BubbleTicketPart v={v} need={shownNeed(need, v.question?.text)} />
      <TicketFooter
        v={v}
        bar={shownBar}
        form={form}
        setForm={setForm}
        actions={api.actions}
        onOpenChat={props.onOpenChat}
        trailing={
          <button type="button" className="link full-ticket" onClick={props.onFullTicket}>
            Full ticket
          </button>
        }
      />
    </>
  );
}

/** What the top of the bubble says, for the ticket part under it not to say again. */
function shownNeed(need: BubbleNeed, question?: string) {
  if (need.kind === 'item') return { text: need.title, item: need.item.title };
  if (need.kind === 'question') return { text: question ?? '' };
  return undefined;
}
