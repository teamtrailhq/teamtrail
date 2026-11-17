import { type AttentionView, type MapSnapshot, type SessionInfo, type TrailDone, deriveStates } from '@teamtrail/core';
import { DetailSection, MetaLine, Row } from '../../components/ui';
import { ago, isRunning, TYPE_TEXT } from '../../lib';
import { contextParts, edgeFor } from '../attention';
import { useBrief } from '../discovery';
import { trailPhase } from './trailPhase';
import { TrailPhaseLine } from './TrailPhaseLine';

/**
 * With no ticket selected, the trail as a whole: its phase, what waits on the human (how many, and the top item),
 * what each agent is on right now, and what is ready next. Each row opens its item or ticket.
 */
export function TrailGlance(props: {
  snap: MapSnapshot;
  sessions: SessionInfo[];
  attention?: AttentionView;
  done?: TrailDone;
  now: number;
  onTicket: (id: string) => void;
  onItem: (item: AttentionView['items'][number]) => void;
}) {
  const { snap } = props;
  const { brief, gated } = useBrief(snap);
  const states = deriveStates(snap.tickets, snap.map.mode);
  const done = !!props.done && props.done.kind !== 'not-done';
  const phase = trailPhase({ done, gated, briefStatus: brief?.status, states: [...states.values()] });
  const waiting = (props.attention?.items ?? []).filter((i) => i.mapId === snap.map.id);
  const top = waiting[0];
  const agents = props.sessions.filter((s) => isRunning(s) && s.mapId === snap.map.id && s.ticketId);
  const ready = snap.tickets.filter((t) => states.get(t.id) === 'frontier');
  const keyed = new Map(snap.tickets.map((t) => [t.id, t]));
  return (
    <div className="detail trail-glance">
      <TrailPhaseLine phase={phase} snap={snap} states={states} reason={done ? props.done?.reason : undefined} />
      {top && (
        <DetailSection label={`Waits on you · ${waiting.length}`}>
          <Row
            edge={edgeFor(top, props.attention?.interrupting.includes(top.id) ?? false)}
            title={top.title.split('\n')[0]}
            context={<MetaLine parts={contextParts({ item: top, snap, otherTrail: false })} />}
            trailing={ago(props.now - top.since)}
            onOpen={() => props.onItem(top)}
          />
        </DetailSection>
      )}
      {agents.length > 0 && (
        <DetailSection label={`Agents now · ${agents.length}`}>
          {agents.map((s) => (
            <Row
              key={s.id}
              edge={s.waitingOn ? 'urgent' : 'neutral'}
              title={keyed.get(s.ticketId!)?.title ?? s.stepLabel}
              context={
                <MetaLine parts={[{ text: s.agent, strong: true }, `${s.stepLabel}, step ${s.step} of ${s.total}`]} />
              }
              onOpen={() => props.onTicket(s.ticketId!)}
            />
          ))}
        </DetailSection>
      )}
      {ready.length > 0 && (
        <DetailSection label={`Ready next · ${ready.length}`}>
          {ready.slice(0, 3).map((t) => (
            <Row
              key={t.id}
              title={t.title}
              context={<MetaLine parts={[{ text: t.key, code: true }, TYPE_TEXT[t.type]]} />}
              onOpen={() => props.onTicket(t.id)}
            />
          ))}
        </DetailSection>
      )}
      <p className="t-meta glance-hint">Pick a ticket on the map to see it here.</p>
    </div>
  );
}
