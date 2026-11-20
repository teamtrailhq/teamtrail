import { type ActivityState, attention, leaseHealth, type MapSnapshot, type TicketLease } from '@teamtrail/core';
import { LabelLine, Row } from '../../components/ui';
import { useNow } from '../../hooks';
import { heldLeases, isRunning, type Selection } from '../../lib';
import { AgentLane } from './AgentLane';
import { LeasePill } from './LeasePill';
import { NoAgents } from './NoAgents';

/**
 * Who is working on what: one lane per agent at work, then the claims without a live session (a teammate, an
 * agent that disconnected and may resume). Milestones only: the agents' every step is not a feed for the human.
 */
export function AgentLanes(props: {
  snap?: MapSnapshot;
  activity: ActivityState;
  leases?: TicketLease[];
  onSelect: (s: Selection) => void;
  onOpenChat: (id: string) => void;
}) {
  const { snap, activity } = props;
  const now = useNow(1000);
  const running = activity.sessions.filter(isRunning);
  const live = new Set(running.map((s) => s.ticketId));
  const held = heldLeases(props.leases, snap?.map.id);
  const claims = snap?.tickets.filter((t) => t.state === 'open' && t.assignee && !live.has(t.id)) ?? [];
  if (!running.length && !claims.length) return <NoAgents />;
  const stalled = (l?: TicketLease) => !!l && leaseHealth(l, now) !== 'live';
  const matching = !!snap?.map.modelMatching?.enabled;
  return (
    <ul className="sessions-list lanes">
      {running.map((s) => {
        const t = snap?.tickets.find((x) => x.id === s.ticketId);
        const lease = t && held.get(t.id);
        return (
          <AgentLane
            key={s.id}
            s={s}
            activity={activity}
            ticket={t}
            lease={lease}
            stalled={stalled(lease)}
            matching={matching}
            now={now}
            onOpen={() => {
              if (t) props.onSelect({ kind: 'ticket', id: t.id });
              if (t && attention(t) === 'hitl') props.onOpenChat(s.id);
            }}
          />
        );
      })}
      {claims.map((t) => (
        <Row
          key={t.id}
          as="li"
          className="lane claim"
          edge={stalled(held.get(t.id)) ? 'attention' : 'neutral'}
          label={<LabelLine parts={[t.assignee, `on ${t.key}`]} />}
          title={t.title}
          detail={
            <>
              <b>Now:</b> claimed, no live session <LeasePill lease={held.get(t.id)} now={now} />
            </>
          }
          onOpen={() => props.onSelect({ kind: 'ticket', id: t.id })}
        />
      ))}
    </ul>
  );
}
