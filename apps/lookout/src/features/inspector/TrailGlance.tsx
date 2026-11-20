import { type AttentionView, type MapSnapshot, type SessionInfo, type TrailDone, deriveStates } from '@teamtrail/core';
import { isRunning, type Selection } from '../../lib';
import { useBrief } from '../discovery';
import { MainChecksSection } from '../main-checks';
import { AssumptionList } from '../plan';
import { TrailChecksSection } from '../trail-checks';
import { GlanceAgents } from './GlanceAgents';
import { GlanceHead } from './GlanceHead';
import { GlanceNext } from './GlanceNext';
import { GlanceWaits } from './GlanceWaits';
import { trailPhase } from './trailPhase';
import { TrailPhaseLine } from './TrailPhaseLine';

/**
 * The trail as a whole (the Plan page, and Trail step with nothing selected): the destination as its headline and the
 * phase, checks on main, then everything that waits on you and the assumptions the plan rests on beside what each
 * agent is on and what is ready next. Each row opens its item or ticket.
 */
export function TrailGlance(props: {
  snap: MapSnapshot;
  sessions: SessionInfo[];
  attention?: AttentionView;
  done?: TrailDone;
  now: number;
  onTicket: (id: string) => void;
  onItem: (item: AttentionView['items'][number]) => void;
  /** Opens a ticket from an assumption's "relied on by". */
  onSelect: (s: Selection) => void;
  /** Shows the destination in full (the Plan page's Destination tab). */
  onDestination?: () => void;
}) {
  const { snap } = props;
  const { brief, gated } = useBrief(snap);
  const states = deriveStates(snap.tickets, snap.map.mode);
  const done = !!props.done && props.done.kind !== 'not-done';
  const phase = trailPhase({ done, gated, briefStatus: brief?.status, states: [...states.values()] });
  const waiting = (props.attention?.items ?? []).filter((i) => i.mapId === snap.map.id);
  const agents = props.sessions.filter((s) => isRunning(s) && s.mapId === snap.map.id && s.ticketId);
  const ready = snap.tickets.filter((t) => states.get(t.id) === 'frontier');
  return (
    <div className="detail trail-glance">
      <GlanceHead snap={snap} onDestination={props.onDestination}>
        <TrailPhaseLine phase={phase} snap={snap} states={states} reason={done ? props.done?.reason : undefined} />
      </GlanceHead>
      {done ? (
        <TrailChecksSection mapId={snap.map.id} now={props.now} />
      ) : (
        <MainChecksSection mapId={snap.map.id} now={props.now} />
      )}
      <div className="glance-grid">
        <div className="glance-col">
          {waiting.length > 0 && (
            <GlanceWaits
              snap={snap}
              items={waiting}
              interrupting={props.attention?.interrupting ?? []}
              now={props.now}
              onItem={props.onItem}
            />
          )}
          <AssumptionList snap={snap} onSelect={props.onSelect} />
        </div>
        <div className="glance-col">
          {agents.length > 0 && <GlanceAgents snap={snap} agents={agents} onTicket={props.onTicket} />}
          {ready.length > 0 && <GlanceNext ready={ready} onTicket={props.onTicket} />}
        </div>
      </div>
      <p className="t-meta glance-hint">A ticket opens in its bubble on the map.</p>
    </div>
  );
}
