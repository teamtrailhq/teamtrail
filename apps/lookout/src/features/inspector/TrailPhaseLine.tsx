import { type MapSnapshot, type NodeState } from '@teamtrail/core';
import { Cursor } from '../../components/ui';
import { cx } from '../../lib';
import { TRAIL_PHASES, type TrailPhase } from './trailPhase';

/** What each phase means for the human, in one line. */
function phaseText(phase: TrailPhase, counts: { done: number; total: number; reason?: string }) {
  switch (phase) {
    case 'discovery':
      return 'Research maps the existing system for the brief; implementation waits for it';
    case 'brief':
      return 'The brief waits on you: implementation starts once you accept it';
    case 'building':
      return `${counts.done} of ${counts.total} tickets done`;
    case 'review':
      return 'All the work is in and waits for verification';
    case 'done':
      return counts.reason ?? 'Every ticket in scope is done';
    default: {
      const never: never = phase;
      return never;
    }
  }
}

/**
 * The trail's phase as squares on a line: past ones filled, the current one blaze with "You are here" and the cursor,
 * then what it means right now.
 */
export function TrailPhaseLine(props: {
  phase: TrailPhase;
  snap: MapSnapshot;
  states: Map<string, NodeState>;
  reason?: string;
}) {
  const at = TRAIL_PHASES.findIndex((p) => p.phase === props.phase);
  const inScope = props.snap.tickets.filter((t) => props.states.get(t.id) !== 'out-of-scope');
  const done = inScope.filter((t) => props.states.get(t.id) === 'decided').length;
  return (
    <div className="glance-phase">
      <ol className="phase-steps" aria-label="Trail phase">
        {TRAIL_PHASES.map((p, i) => (
          <li
            key={p.phase}
            className={cx(i < at && 'past', i === at && 'now')}
            aria-current={i === at ? 'step' : undefined}
          >
            <span className="phase-sq" aria-hidden="true" />
            <span className="phase-nm">{p.label}</span>
            {i === at && (
              <span className="phase-here">
                <Cursor />
                You are here
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="t-body phase-text">
        {phaseText(props.phase, { done, total: inScope.length, reason: props.reason })}
      </p>
    </div>
  );
}
