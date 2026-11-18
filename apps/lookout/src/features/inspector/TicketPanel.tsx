import type { AttentionItem, AttentionView, MapSnapshot, SessionInfo, Ticket } from '@teamtrail/core';
import { useState } from 'react';
import type { LookoutApi } from '../../hooks';
import { HeldRules } from '../diff-rules';
import { PullRequestBlock } from '../pr-sync';
import { TicketProof } from '../proof';
import { CriteriaSection } from './CriteriaSection';
import { HistorySection } from './HistorySection';
import { HowSection } from './HowSection';
import { ProgressSection } from './ProgressSection';
import { StandingLine } from './StandingLine';
import { TicketFooter } from './TicketFooter';
import { TicketHead } from './TicketHead';
import type { Form } from './types';
import { useTicketActions } from './useTicketActions';
import { useTicketView } from './useTicketView';
import { WhatSection } from './WhatSection';

/**
 * One ticket, whole, in the same anatomy as its bubble: the title and its chips, where it stands, then labelled
 * read-only sections in a fixed order, each left out when it has nothing to say (What, Acceptance criteria, How,
 * Progress, Proof, History), and at the end every action, held in view while the ticket scrolls.
 */
export function TicketPanel(props: {
  snap: MapSnapshot;
  t: Ticket;
  api: LookoutApi;
  sessions: SessionInfo[];
  attention?: AttentionView;
  form: Form;
  setForm: (f: Form) => void;
  onOpenChat: (id: string) => void;
  onOpenDecision?: (id: string) => void;
  onReviewChange?: () => void;
  onReviewBrief?: (mapId: string) => void;
  onItem?: (item: AttentionItem) => void;
  onDismiss?: (id: string) => void;
}) {
  const { snap, t, api } = props;
  const v = useTicketView({ snap, t, api, sessions: props.sessions, attention: props.attention });
  const [editing, setEditing] = useState(false);
  const bar = useTicketActions({
    v,
    api,
    setForm: props.setForm,
    onEditHow: () => setEditing(true),
    onOpenChat: props.onOpenChat,
    onReviewChange: props.onReviewChange,
    onReviewBrief: props.onReviewBrief,
    onItem: props.onItem,
    onDismiss: props.onDismiss,
  });
  return (
    <div className="detail ticket-panel">
      <TicketHead v={v} />
      <StandingLine v={v} />
      <PullRequestBlock sync={v.pr} proofHead={v.proof?.proof.git?.head} />
      <WhatSection v={v} />
      <CriteriaSection v={v} />
      <HowSection v={v} editing={editing} setEditing={setEditing} act={bar.act} />
      <ProgressSection v={v} onUndoWaiver={bar.undoWaiver} />
      <HeldRules mapId={snap.map.id} ticketId={t.id} />
      <TicketProof ticket={t} view={v.proof} actions={bar.gapActions} />
      <HistorySection t={t} decisions={v.decisions} onOpenDecision={props.onOpenDecision} />
      <TicketFooter
        v={v}
        bar={bar}
        form={props.form}
        setForm={props.setForm}
        actions={api.actions}
        onOpenChat={props.onOpenChat}
        className="sticky"
      />
    </div>
  );
}
