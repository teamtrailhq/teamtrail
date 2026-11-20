/** Where one step of a step track stands: passed, the one being worked on, or still ahead. */
export type StepState = 'done' | 'now' | 'todo';

/**
 * The steps of a track of `total`, with `step` (1-based) the one being worked on: every step before it done, it
 * `now`, the rest ahead. A step past the end marks them all done; none under 1 marks none. `total` is a whole number
 * from 0 up; anything else is read as 0.
 */
export function stepStates(o: { step: number; total: number }): StepState[] {
  const total = Number.isFinite(o.total) ? Math.max(0, Math.floor(o.total)) : 0;
  const step = Number.isFinite(o.step) ? Math.floor(o.step) : 0;
  return Array.from({ length: total }, (_, i) => stateOf(i + 1, step));
}

function stateOf(position: number, step: number): StepState {
  if (position < step) return 'done';
  if (position === step) return 'now';
  return 'todo';
}
