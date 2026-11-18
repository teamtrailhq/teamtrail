import type { EscapeCheckRow, Scorecard } from '@teamtrail/core';
import { Empty } from '../../components/ui';
import { CheckEscapeRow } from './CheckEscapeRow';
import { EscapeRow } from './EscapeRow';

/**
 * Scorecard → Came back: verified work later reopened or reverted, per check that had passed on it, then each one.
 * The one number that says whether "verified" means anything here.
 */
export function CameBack(props: {
  checks: EscapeCheckRow[];
  escapes: NonNullable<Scorecard['escapes']>;
  minSample: number;
}) {
  if (!props.escapes.length) return <Empty>Nothing verified has come back: no reopens, no reverts on main.</Empty>;
  return (
    <ul className="perf-rows">
      {props.checks.map((r) => (
        <CheckEscapeRow key={r.key} r={r} minSample={props.minSample} />
      ))}
      {props.escapes.map((e) => (
        <EscapeRow key={`${e.mapId}/${e.ticketId}/${e.attemptId}`} e={e} />
      ))}
    </ul>
  );
}
