import type { AttentionItem, AttentionView, SessionInfo, TrailDone } from '@teamtrail/core';
import { useState, useEffect, type ReactNode } from 'react';
import { Zone, EmptyState } from '../../components/ui';
import { useNow, type LookoutApi } from '../../hooks';
import type { Selection } from '../../lib';
import { TicketDetail } from './TicketDetail';
import { TrailGlance } from './TrailGlance';
import type { Form } from './types';
import { UnspecifiedDetail } from './UnspecifiedDetail';

/**
 * The Trail step zone: the ticket selected on the map, state first, or with none selected the trail at a glance.
 * `onItem` opens a queue item where the human handles it; `onReviewChange` and `onReviewBrief` open Approvals and
 * the brief from a ticket's action bar.
 */
export function Inspector(props: {
  api: LookoutApi;
  sessions: SessionInfo[];
  bare?: boolean;
  attention?: AttentionView;
  done?: TrailDone;
  onOpenChat?: (sessionId: string) => void;
  onOpenDecision?: (id: string) => void;
  onItem?: (item: AttentionItem) => void;
  onReviewChange?: () => void;
  onReviewBrief?: (mapId: string) => void;
}) {
  const { api } = props;
  const { snap, selection, actions } = api;
  const [form, setForm] = useState<Form>(null);
  const now = useNow(5000);
  const key = selectionKey(selection);
  useEffect(() => setForm(null), [key]);
  const onOpenChat = props.onOpenChat ?? actions.openChat;

  let body: ReactNode;
  if (!snap) {
    body = <EmptyState title="No trail yet" hint="Once there's a trail, pick a ticket on the map to see it here." />;
  } else if (selection?.kind !== 'ticket' && selection?.kind !== 'unspecified') {
    body = (
      <TrailGlance
        snap={snap}
        sessions={props.sessions}
        attention={props.attention}
        done={props.done}
        now={now}
        onTicket={(id) => api.setSelection({ kind: 'ticket', id })}
        onItem={(item) => props.onItem?.(item)}
      />
    );
  } else if (selection.kind === 'unspecified') {
    body = <UnspecifiedDetail snap={snap} item={selection.item} api={api} />;
  } else {
    body = (
      <TicketDetail
        snap={snap}
        id={selection.id}
        api={api}
        sessions={props.sessions}
        attention={props.attention}
        form={form}
        setForm={setForm}
        onOpenChat={onOpenChat}
        onOpenDecision={props.onOpenDecision}
        onReviewChange={props.onReviewChange}
        onReviewBrief={props.onReviewBrief}
      />
    );
  }

  return (
    <Zone
      area="inspector"
      icon="note"
      title="Trail step"
      info="The ticket you selected on the map: where it stands, what you can do, and what it is. With none selected, the trail at a glance."
      className="inspector"
      bare={props.bare}
    >
      {body}
    </Zone>
  );
}

function selectionKey(selection: Selection) {
  if (selection?.kind === 'ticket') return selection.id;
  if (selection?.kind === 'unspecified') return selection.item;
  return selection?.kind ?? '';
}
