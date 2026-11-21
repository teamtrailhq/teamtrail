import type { AuditDecision, TrailBriefing } from '@teamtrail/core';
import { useState } from 'react';
import { Button, LabelLine } from '../../components/ui';
import { hm } from '../../lib';
import type { ProofStatuses } from '../map';
import { DecisionSince } from './DecisionSince';
import { DoneSince } from './DoneSince';
import { PlanSince } from './PlanSince';
import { type SinceRow, sinceRows } from './sinceRows';

/** Rows shown before "Show N more". */
const SHOWN = 6;

/** "9:40" today, else "Nov 17, 9:40". */
function when(at: number, now: number) {
  const d = new Date(at);
  if (d.toDateString() === new Date(now).toDateString()) return hm(at);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${hm(at)}`;
}

/**
 * Since you were away, as one card: on the trail on screen, the decisions agents made themselves (keep or overrule),
 * changes to the plan, and verified work with its pull request, since the person's last visit.
 */
export function SinceAway(props: {
  trail?: TrailBriefing;
  /** The person's last visit; none on their first, when the story starts with the trail. */
  since?: number;
  chartedAt: number;
  decisions: AuditDecision[];
  proofs?: ProofStatuses;
  now: number;
  onTicket: (ticketId: string) => void;
  onSupersede: (d: AuditDecision, input: { answer: string; rationale?: string; alternatives?: string[] }) => void;
}) {
  const [all, setAll] = useState(false);
  const rows = props.trail ? sinceRows(props.trail, props.chartedAt) : [];
  const shown = all ? rows : rows.slice(0, SHOWN);
  const row = (r: SinceRow, i: number) => {
    switch (r.kind) {
      case 'decision': {
        const audit = props.decisions.find((d) => d.id === r.decision.id && d.mapId === r.decision.mapId);
        return <DecisionSince key={r.decision.id} d={r.decision} audit={audit} onSupersede={props.onSupersede} />;
      }
      case 'ruled-out':
      case 'added':
        return <PlanSince key={r.kind} row={r} onTicket={props.onTicket} />;
      case 'done':
        return (
          <DoneSince
            key={`done-${i}`}
            mapId={props.trail!.mapId}
            ticket={r.ticket}
            proofs={props.proofs}
            onTicket={props.onTicket}
          />
        );
      default: {
        const never: never = r;
        return never;
      }
    }
  };
  const title =
    props.since === undefined
      ? ['Since the trail was charted', when(props.chartedAt, props.now)]
      : ['Since you were away', `since ${when(props.since, props.now)}`];
  return (
    <section className="home-section home-panel home-since" aria-labelledby="home-since">
      <h2 id="home-since" className="home-bar">
        <LabelLine parts={title} />
      </h2>
      {rows.length === 0 ? (
        <p className="home-panel-empty t-meta">Nothing new on this trail since then.</p>
      ) : (
        <ul className="home-rows">{shown.map(row)}</ul>
      )}
      {rows.length > SHOWN && (
        <div className="home-panel-foot">
          <LabelLine parts={[all ? `All ${rows.length} shown` : `${rows.length - SHOWN} more`]} />
          <Button variant="ghost" className="home-more" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : 'Show all'}
          </Button>
        </div>
      )}
    </section>
  );
}
