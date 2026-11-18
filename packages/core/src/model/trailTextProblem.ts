import { TRAIL_TEXT_LIMITS } from './trailTextLimits';

const count = (n: number) => n.toLocaleString('en-US');

/** What is too long in a trail's text, in words people read; undefined when it all fits TRAIL_TEXT_LIMITS. */
export function trailTextProblem(t: { destination?: string; notes?: string; assumptions?: string[] }) {
  const L = TRAIL_TEXT_LIMITS;
  const destination = t.destination?.trim().length ?? 0;
  if (destination > L.destination)
    return `The destination is too long: ${count(destination)} characters, at most ${count(L.destination)}.`;
  const notes = t.notes?.trim().length ?? 0;
  if (notes > L.notes) return `The notes are too long: ${count(notes)} characters, at most ${count(L.notes)}.`;
  const assumptions = t.assumptions ?? [];
  if (assumptions.length > L.assumptions)
    return `Too many assumptions: ${count(assumptions.length)}, at most ${L.assumptions}. Each line is one assumption.`;
  const long = assumptions.findIndex((a) => a.trim().length > L.assumption);
  if (long >= 0) return `Assumption ${long + 1} is too long: at most ${L.assumption} characters on one line.`;
  return undefined;
}
