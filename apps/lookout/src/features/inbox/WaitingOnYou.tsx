import type { ActivityState, MapSnapshot } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Badge, ScoutMark, SectionHeader } from '../../components/ui';
import { AttentionQueue, type AttentionApi, type AttentionHandlers } from '../attention';
import { ApprovalList } from './ApprovalList';
import { HitlReadout } from './HitlReadout';
import { InboxList } from './InboxList';
import { useApprovals } from './useApprovals';

/**
 * "Waiting on you": the ranked attention queue (questions, approvals, blocked work, flags, knowledge, …).
 * Until the queue has loaded, or where the server has none, the plain question and approval lists.
 */
export function WaitingOnYou(props: {
  activity: ActivityState;
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  sessionId?: string;
  attention?: AttentionApi;
  handlers?: AttentionHandlers;
  /**
   * The current trail's brief while it waits for review, for the plain lists: the queue lists it as a `brief` item
   * (core attention/sources/briefSource.ts), so it counts there like everything else waiting on you.
   */
  brief?: ReactNode;
  onOpenQuestion: (sessionId: string, ticketId?: string) => void;
  onOpenTicket: (mapId: string, ticketId: string) => void;
}) {
  const questions = [...props.activity.pending].sort((a, b) => a.at - b.at);
  const approvals = useApprovals(props.snaps);
  const view = props.attention?.view;
  const briefs = props.brief ? 1 : 0;
  const waiting = view ? view.items.length : questions.length + approvals.length + briefs;
  const header = (
    <SectionHeader
      hot={waiting > 0}
      title={
        <>
          {waiting > 0 && <ScoutMark variant="alert" size={12} />}
          Waiting on you
        </>
      }
      count={<Badge key={waiting} n={waiting} urgent={waiting > 0} pop />}
    />
  );
  if (view && props.attention && props.handlers)
    return (
      <div className="inbox-part">
        {header}
        <HitlReadout activity={props.activity} />
        <AttentionQueue
          view={view}
          snaps={props.snaps}
          pending={props.activity.pending}
          currentMapId={props.currentMapId}
          selected={props.sessionId}
          handlers={props.handlers}
          onSnooze={props.attention.snooze}
          onDismiss={props.attention.dismiss}
        />
      </div>
    );
  return (
    <div className="inbox-part">
      {header}
      <HitlReadout activity={props.activity} />
      {props.brief}
      <ApprovalList
        items={approvals}
        snaps={props.snaps}
        currentMapId={props.currentMapId}
        onOpen={props.onOpenTicket}
      />
      {(questions.length > 0 || !(approvals.length + briefs)) && (
        <InboxList
          items={questions}
          snaps={props.snaps}
          currentMapId={props.currentMapId}
          selected={props.sessionId}
          onOpen={props.onOpenQuestion}
        />
      )}
    </div>
  );
}
