import type { AttentionView, MapSnapshot, SessionInfo, Ticket } from '@teamtrail/core';
import { useState } from 'react';
import type { LookoutApi } from '../../hooks';
import { TicketProof } from '../proof';
import { ActionBar } from './ActionBar';
import { HistorySection } from './HistorySection';
import { HowSection } from './HowSection';
import { ProgressSection } from './ProgressSection';
import { StandingLine } from './StandingLine';
import { TicketForms } from './TicketForms';
import { TicketHead } from './TicketHead';
import type { Form } from './types';
import { useTicketActions } from './useTicketActions';
import { useTicketView } from './useTicketView';
import { WhatSection } from './WhatSection';

/**
 * One ticket, state first: the title, where it stands and who it waits on, one bar with every action, then
 * read-only sections in a fixed order (What, How, Progress, Proof, History), each showing only what helps at a
 * glance, the rest behind Details.
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
  });
  const decisions = api.decisions.filter((d) => d.mapId === snap.map.id && d.ticketId === t.id);
  return (
    <div className="detail ticket-panel">
      <TicketHead t={t} tickets={snap.tickets} />
      <StandingLine v={v} />
      <ActionBar v={v} bar={bar} onOpenChat={props.onOpenChat} />
      <TicketForms
        form={props.form}
        setForm={props.setForm}
        v={v}
        actions={api.actions}
        act={bar.act}
        waive={bar.waive}
      />
      <WhatSection v={v} />
      <HowSection v={v} editing={editing} setEditing={setEditing} act={bar.act} />
      <ProgressSection v={v} onUndoWaiver={bar.undoWaiver} />
      <TicketProof ticket={t} view={v.proof} />
      <HistorySection t={t} decisions={decisions} onOpenDecision={props.onOpenDecision} />
    </div>
  );
}
