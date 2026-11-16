import type { ActivityState, MapSnapshot } from '@teamtrail/core';
import { type ReactNode, useState, useEffect } from 'react';
import { SectionHeader, Panel } from '../../components/ui';
import type { AttentionApi, AttentionHandlers } from '../attention';
import { Conversation } from './Conversation';
import { WaitingOnYou } from './WaitingOnYou';

export function InboxPane(props: {
  activity: ActivityState;
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  sessionId?: string;
  layout: 'split' | 'stack';
  convRequest: number;
  onOpen: (sessionId: string, ticketId?: string) => void;
  onAnswer: (questionId: string, text: string) => void;
  /** Opens a ticket waiting on approval in the inspector. */
  onOpenTicket: (mapId: string, ticketId: string) => void;
  /** The ranked queue and where its items open (questions open here, in the conversation). */
  attention?: AttentionApi;
  handlers?: Omit<AttentionHandlers, 'openQuestion'>;
  /** Rendered under the inbox in the same column (the Up next list). */
  below?: ReactNode;
  /** The current trail's discovery brief while it waits for review, for when the ranked queue isn't there. */
  brief?: ReactNode;
}) {
  const [view, setView] = useState<'list' | 'conv'>('list');
  const [questionId, setQuestionId] = useState<string>();
  useEffect(() => {
    if (props.convRequest) setView('conv');
  }, [props.convRequest]);
  const open = (sessionId: string, ticketId?: string) => {
    props.onOpen(sessionId, ticketId);
    setView('conv');
  };
  const openQuestion = (questionId: string) => {
    const q = props.activity.pending.find((p) => p.id === questionId);
    if (!q) return;
    setQuestionId(q.id);
    open(q.sessionId, q.ticketId);
  };

  const list = (
    <WaitingOnYou
      activity={props.activity}
      snaps={props.snaps}
      currentMapId={props.currentMapId}
      sessionId={props.sessionId}
      attention={props.attention}
      handlers={props.handlers && { ...props.handlers, openQuestion }}
      brief={props.brief}
      onOpenQuestion={open}
      onOpenTicket={props.onOpenTicket}
    />
  );
  const conv = (
    <Conversation
      activity={props.activity}
      snaps={props.snaps}
      sessionId={props.sessionId}
      questionId={questionId}
      onAnswer={props.onAnswer}
      onBack={props.layout === 'stack' ? () => setView('list') : undefined}
    />
  );

  if (props.layout === 'stack')
    return (
      <Panel className="zone inbox stack">
        {view === 'conv' && props.sessionId ? (
          conv
        ) : (
          <div className="stack-scroll">
            {list}
            {props.below}
          </div>
        )}
      </Panel>
    );
  const hasConv = !!props.activity.sessions.find((s) => s.id === props.sessionId);
  return (
    <Panel className={`zone inbox split ${hasConv ? 'has-conv' : ''}`} style={{ gridArea: 'inbox' }}>
      <SectionHeader
        className="zone-title"
        icon="mailbox"
        title="Communication"
        info="Where your agents reach you: everything waiting on you, ranked with the reasons why, the conversation with the agent that asked, and the tickets coming up next."
      />
      {list}
      {hasConv && conv}
      {props.below}
    </Panel>
  );
}
