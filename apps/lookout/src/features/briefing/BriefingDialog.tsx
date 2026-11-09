import {
  decisionsByRisk,
  type PendingQuestion,
  type SessionInfo,
  type Briefing,
  type MapSnapshot,
  type TrailBriefing,
  type Ticket,
  type DecisionRecord,
} from '@teamtrail/core';
import { ScoutAvatar } from '@teamtrail/scout-avatar';
import { useEffect, type ReactNode } from 'react';
import { Panel, Label, Card, Button, ScoutMark } from '../../components/ui';
import type { Breakpoint } from '../../hooks';
import { dur, usd, tokens } from '../../lib';
import { BriefingList } from './BriefingList';
import { BriefingRow } from './BriefingRow';
import { BriefingTile } from './BriefingTile';
import { sinceLabel } from './sinceLabel';

export interface BriefingActions {
  onTicket: (mapId: string, ticketId: string) => void;
  onAnswer: (q: PendingQuestion) => void;
  onDecision: (id: string) => void;
  onSession: (s: SessionInfo) => void;
  onResume: () => void;
  onClose: () => void;
}

/** "While you were away": what changed in each trail since the trail lead was last present. */
export function BriefingDialog(
  props: { briefing?: Briefing; line: string; snaps: Record<string, MapSnapshot>; bp: Breakpoint } & BriefingActions,
) {
  const { briefing: b, bp, onClose } = props;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const first = b?.trails.flatMap((m) => m.waiting).sort((x, y) => x.at - y.at)[0];
  const t = b?.totals;
  const multi = (b?.trails.length ?? 0) > 1;
  const phone = bp === 'mobile';
  const ticketTitle = (q: PendingQuestion) =>
    (q.ticketId && props.snaps[q.mapId]?.tickets.find((x) => x.id === q.ticketId)?.title) || q.text;
  const ticketKey = (q: PendingQuestion) =>
    (q.ticketId && props.snaps[q.mapId]?.tickets.find((x) => x.id === q.ticketId)?.key) || q.agent;

  const lists = (m: TrailBriefing) => {
    const ticket = (x: Ticket, meta?: ReactNode) => (
      <BriefingRow key={x.id} k={x.key} text={x.title} meta={meta} onClick={() => props.onTicket(m.mapId, x.id)} />
    );
    const decision = (d: DecisionRecord, meta?: string) => (
      <BriefingRow
        key={d.id}
        k={d.id}
        text={d.summary || d.answer}
        title={d.risk ? `${d.question}\n\n${d.risk.reason}` : d.question}
        meta={meta}
        onClick={() => props.onDecision(d.id)}
      />
    );
    const byRisk = decisionsByRisk(m.agentDecisions).flatMap((g) => g.decisions.map((d) => decision(d, g.label)));
    const left = [
      <BriefingList key="done" title="Done">
        {m.done.map((x) => ticket(x))}
      </BriefingList>,
      <BriefingList key="oos" title="Ruled out">
        {phone ? [] : m.ruledOut.map((x) => ticket(x))}
      </BriefingList>,
      <BriefingList key="blocked" title="Blocked">
        {m.blocked.map((x) => ticket(x.ticket, `needs ${x.on.map((o) => o.key).join(', ')}`))}
      </BriefingList>,
    ];
    const right = [
      <BriefingList key="waiting" title="Waiting on you" urgent>
        {m.waiting.map((q) => (
          <BriefingRow
            key={q.id}
            k={ticketKey(q)}
            text={ticketTitle(q)}
            meta={b!.now - q.at < 60_000 ? 'now' : dur(b!.now - q.at)}
            title={q.text}
            onClick={() => props.onAnswer(q)}
          />
        ))}
      </BriefingList>,
      <BriefingList key="agent" title="Agent decisions">
        {phone ? [] : byRisk}
      </BriefingList>,
      <BriefingList key="active" title="Active sessions">
        {phone
          ? []
          : m.active.map((s) => {
              const tk = s.ticketId ? props.snaps[m.mapId]?.tickets.find((x) => x.id === s.ticketId) : undefined;
              return (
                <BriefingRow
                  key={s.id}
                  k={tk?.key ?? s.agent}
                  text={tk ? `${tk.title} · ${s.stepLabel}` : s.stepLabel}
                  meta={`${s.step}/${s.total}`}
                  onClick={() => props.onSession(s)}
                />
              );
            })}
      </BriefingList>,
    ];
    return (
      <section key={m.mapId} className="bf-trail">
        {multi && (
          <div className="bf-trail-h">
            <span className="key">{m.key}</span> {m.title}
          </div>
        )}
        <div className="bf-cols">
          <div>{left}</div>
          <div>{right}</div>
        </div>
      </section>
    );
  };

  return (
    <div className="scrim" onClick={onClose}>
      <Panel
        as="div"
        className="dialog briefing"
        role="dialog"
        aria-label="While you were away"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 className="t-heading caps">While you were away</h2>
          {b && b.trails.length > 0 && <Label className="bf-since">{sinceLabel(b.since, b.now)}</Label>}
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <Card className="bf-scout">
          <ScoutAvatar
            size={phone ? 1.1 : 1.3}
            speaking={props.line || 'Nothing new since you were last here.'}
            caption={false}
            framed={false}
          />
          <div>
            <span className="mono-label">Scout</span>
            <p>{props.line || 'Nothing new since you were last here.'}</p>
          </div>
        </Card>
        {b && t && b.trails.length > 0 && (
          <>
            <div className="bf-tiles">
              <BriefingTile label="Done" value={t.done} sub={t.ruledOut ? `${t.ruledOut} ruled out` : undefined} />
              <BriefingTile label="Blocked" value={t.blocked} sub={t.blocked ? 'Needs your answer' : undefined} />
              <BriefingTile
                label="Waiting on you"
                value={t.waiting}
                sub={oldestWait(t.oldestWaitMs)}
                urgent={t.waiting > 0}
              />
              <BriefingTile label="Agent decisions" value={t.agentDecisions} className="opt" />
              <BriefingTile
                label="Spend"
                value={usd(t.usage.costUsd)}
                sub={`${tokens(t.usage.inputTokens + t.usage.outputTokens)} tokens · ${t.usage.sessions} sessions${t.active ? ` · ${t.active} active` : ''}`}
              />
            </div>
            <div className="bf-body">{b.trails.map(lists)}</div>
          </>
        )}
        <footer>
          <Button onClick={onClose}>Dismiss</Button>
          {first ? (
            <Button variant="urgent" onClick={() => props.onAnswer(first)}>
              <ScoutMark variant="alert" size={13} />
              Answer first decision
            </Button>
          ) : (
            <Button variant="primary" onClick={props.onResume}>
              Resume trail
            </Button>
          )}
        </footer>
      </Panel>
    </div>
  );
}

function oldestWait(ms: number | undefined) {
  if (ms === undefined) return undefined;
  if (ms < 60_000) return 'Just asked';
  return `Oldest ${dur(ms)}`;
}
