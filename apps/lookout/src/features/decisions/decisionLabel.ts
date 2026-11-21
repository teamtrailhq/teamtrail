import { type AuditDecision, madeBy } from '@teamtrail/core';
import type { LabelPart } from '../../components/ui';

/** Who decided: the agent in blaze, YOU (or the signed-in person's name) for this machine's trail lead, else as shown. */
function whoPart(d: AuditDecision, shown: string): LabelPart {
  const by = madeBy(d);
  if (by === 'agent') return { text: shown, tone: 'agent' };
  if (by === 'human' && d.decidedBy === 'trail lead') return d.decidedByName ?? 'You';
  return shown;
}

/**
 * A decision's label line: D-n · #ticket · trail · who decided · risk · time · kept/cited. Who decided is YOU for
 * this machine's trail lead, the agent in blaze for an agent's own call, and the name otherwise (Slack, a teammate,
 * text).
 */
export function decisionLabel(o: {
  d: AuditDecision;
  who: string;
  trail?: string;
  time: string;
  kept?: boolean;
  cited?: number;
}): LabelPart[] {
  const { d } = o;
  return [
    d.id,
    d.ticketKey ?? '',
    o.trail ?? '',
    whoPart(d, o.who),
    d.risk ? `${d.risk.level} risk` : '',
    o.time,
    o.kept ? { text: 'kept by you', tone: 'ok' } : '',
    o.cited ? `cited ${o.cited}×` : '',
  ];
}
