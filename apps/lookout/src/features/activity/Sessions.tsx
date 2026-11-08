import {
  type MapSnapshot,
  type ActivityState,
  attention,
  leaseHealth,
  sessionTokens,
  type TicketLease,
} from '@teamtrail/core';
import { Empty, MetaLine, Row, type EdgeTone } from '../../components/ui';
import { useNow } from '../../hooks';
import { type Selection, tokens, usd, hms, isRunning, heldLeases } from '../../lib';
import { LeasePill } from './LeasePill';
import { Segments } from './Segments';

type Session = ActivityState['sessions'][number];

/**
 * Who is working on what: one row per agent session (the ticket as the title; the agent, its step and spend as
 * the context; the timer on the right; progress below), plus claims without a session (e.g. teammates).
 */
export function Sessions({
  snap,
  activity,
  leases,
  onSelect,
  onOpenChat,
}: {
  snap?: MapSnapshot;
  activity: ActivityState;
  leases?: TicketLease[];
  onSelect: (s: Selection) => void;
  onOpenChat: (id: string) => void;
}) {
  const now = useNow(1000);
  const running = activity.sessions.filter(isRunning);
  const live = new Set(running.map((s) => s.ticketId));
  const held = heldLeases(leases, snap?.map.id);
  const claims = snap?.tickets.filter((t) => t.state === 'open' && t.assignee && !live.has(t.id)) ?? [];
  if (!running.length && !claims.length) return <Empty>No agent on a ticket</Empty>;
  const stalled = (l?: TicketLease) => !!l && leaseHealth(l, now) !== 'live';
  const matching = !!snap?.map.modelMatching?.enabled;
  return (
    <ul className="sessions-list">
      {running.map((s) => {
        const t = snap?.tickets.find((x) => x.id === s.ticketId);
        const hitl = t ? attention(t) === 'hitl' : false;
        const lease = t && held.get(t.id);
        return (
          <Row
            key={s.id}
            as="li"
            className={s.waitingOn ? 'waiting' : undefined}
            edge={sessionEdge(s, stalled(lease))}
            title={ticketLabel(t, s.mode) || s.agent}
            context={
              <MetaLine
                parts={[
                  { text: s.agent, strong: true },
                  matching && tierPart(s),
                  s.waitingOn ? { text: 'Waiting on you', urgent: true } : `${s.mode} · ${s.stepLabel.toLowerCase()}`,
                  hitl && !s.waitingOn && 'with you',
                  usageText(s),
                ]}
              >
                <LeasePill lease={lease} now={now} />
              </MetaLine>
            }
            trailing={hms(now - s.startedAt)}
            below={<Segments total={s.total} step={s.step} />}
            onOpen={() => {
              if (t) onSelect({ kind: 'ticket', id: t.id });
              if (hitl) onOpenChat(s.id);
            }}
          />
        );
      })}
      {claims.map((t) => (
        <Row
          key={t.id}
          as="li"
          className="claim"
          edge={stalled(held.get(t.id)) ? 'attention' : 'neutral'}
          title={`${t.key} ${t.title}`}
          context={
            <MetaLine parts={[{ text: t.assignee ?? '', strong: true }, 'claimed, no live session']}>
              <LeasePill lease={held.get(t.id)} now={now} />
            </MetaLine>
          }
          onOpen={() => onSelect({ kind: 'ticket', id: t.id })}
        />
      ))}
    </ul>
  );
}

function sessionEdge(s: Session, stalled: boolean): EdgeTone {
  if (s.waitingOn) return 'urgent';
  return stalled ? 'attention' : 'neutral';
}

/** Model matching: the session's tier next to its callsign, the model it was read from on hover. */
function tierPart(s: Session) {
  const tip = s.model ? `Runs ${s.model}` : 'No model reported, so it counts as balanced';
  return { text: s.tier ?? 'balanced', tip, className: 'session-tier' };
}

/** Spend in plain words (where the numbers come from is in the trail spend tooltip). */
function usageText(s: Session) {
  if (!s.usage) return undefined;
  return `${tokens(sessionTokens(s))} tok · ${usd(s.usage.costUsd)}`;
}

function ticketLabel(t: { key: string; title: string } | undefined, mode: string) {
  if (t) return `${t.key} ${t.title}`;
  if (mode === 'chart') return 'Charting trail';
  return '';
}
