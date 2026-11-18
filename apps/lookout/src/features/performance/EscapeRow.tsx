import type { Scorecard } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';

type Escape = NonNullable<Scorecard['escapes']>[number];

/** One escape: the ticket, how it came back, who did the work, the checks that passed, and the evidence. */
export function EscapeRow({ e }: { e: Escape }) {
  return (
    <Row
      as="li"
      className="perf-row score-row"
      title={`${e.ticketKey} ${e.kind}`}
      trailing={<span className="t-meta">{new Date(e.at).toLocaleDateString()}</span>}
      context={<MetaLine parts={[e.agent, e.checks.length ? `passed ${e.checks.join(', ')}` : 'no check ran']} />}
      detail={e.evidence}
    />
  );
}
