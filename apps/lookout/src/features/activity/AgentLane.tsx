import { type ActivityState, type MapSnapshot, sessionTokens, type TicketLease } from '@teamtrail/core';
import { LabelLine, Row } from '../../components/ui';
import { isRunning, shortModel, tokens, usd } from '../../lib';
import { agentMilestones } from './agentMilestones';
import { laneSince } from './laneSince';
import { LeasePill } from './LeasePill';
import { Milestones } from './Milestones';
import { SessionTier } from './SessionTier';

type Session = ActivityState['sessions'][number];
type Ticket = MapSnapshot['tickets'][number];

/**
 * One agent's lane: who and on what (agent · model · on #n, how long on the right), the ticket as the title, its
 * milestones, and one "Now:" line with its latest step. The lane waiting on you has the rose edge; a stalled
 * claim says so after the Now line.
 */
export function AgentLane(props: {
  s: Session;
  activity: ActivityState;
  ticket?: Ticket;
  lease?: TicketLease;
  stalled: boolean;
  /** Model matching is on: the session's tier joins the label line. */
  matching: boolean;
  now: number;
  onOpen: () => void;
}) {
  const { s, ticket, now } = props;
  const model = shortModel(s.model);
  const waiting = !!s.waitingOn;
  const items = agentMilestones({ session: s, feed: props.activity.feed });
  return (
    <Row
      as="li"
      className={waiting ? 'lane waiting' : 'lane'}
      edge={edgeOf(waiting, props.stalled)}
      label={
        <span className="lane-head">
          <LabelLine parts={[s.agent, model && { text: model, tip: s.model }, ticket && `on ${ticket.key}`]}>
            {props.matching && <SessionTier s={s} />}
          </LabelLine>
          <span className="lane-since" title={spend(s)}>
            {laneSince(now - s.startedAt)}
          </span>
        </span>
      }
      title={ticket?.title ?? modeTitle(s)}
      context={<Milestones items={items} working={isRunning(s) && !waiting} />}
      detail={
        <>
          <b>Now:</b> {nowText(s, props.activity, now)} <LeasePill lease={props.lease} now={now} />
        </>
      }
      onOpen={props.onOpen}
    />
  );
}

function edgeOf(waiting: boolean, stalled: boolean) {
  if (waiting) return 'urgent' as const;
  return stalled ? ('attention' as const) : ('neutral' as const);
}

/** The latest step in words, or how long it has waited for your answer. */
function nowText(s: Session, activity: ActivityState, now: number) {
  if (s.waitingOn) {
    const q = activity.pending.find((p) => p.id === s.waitingOn);
    return q ? `waiting for your answer · ${laneSince(now - q.at)}` : 'waiting for your answer';
  }
  if (!isRunning(s)) return s.status === 'done' ? 'finished' : 'stopped';
  return `step ${s.step} of ${s.total} · ${s.stepLabel.toLowerCase()}`;
}

function modeTitle(s: Session) {
  return s.mode === 'chart' ? 'Charting the trail' : 'Between tickets';
}

/** The session's spend, on hover of its time: the trail's total is in the header. */
function spend(s: Session) {
  if (!s.usage) return undefined;
  return `${tokens(sessionTokens(s))} tok · ${usd(s.usage.costUsd)} this session`;
}
