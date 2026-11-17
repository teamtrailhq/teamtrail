import { type MapSnapshot, type NodeState } from '@teamtrail/core';
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

/** The trail's phase as a row of steps, the current one marked, and what it means right now. */
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
    <header className="glance-head">
      <ol className="phase-steps" aria-label="Trail phase">
        {TRAIL_PHASES.map((p, i) => (
          <li
            key={p.phase}
            className={cx(i < at && 'past', i === at && 'now')}
            aria-current={i === at ? 'step' : undefined}
          >
            {p.label}
          </li>
        ))}
      </ol>
      <p className="t-body">{phaseText(props.phase, { done, total: inScope.length, reason: props.reason })}</p>
    </header>
  );
}
