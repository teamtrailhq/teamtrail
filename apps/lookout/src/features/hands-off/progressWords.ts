import type { MetaPart } from '../../components/ui';
import type { ProofStatuses } from '../map';
import type { TrailCounts, TrailSegment } from '../trail-bar';

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/**
 * How many done tickets with a proof are verified, in words: "all verified", "7 verified"; nothing until the proofs
 * load, or when no done ticket has one yet (research and decisions have none).
 */
function verifiedWords(segments: TrailSegment[], proofs?: ProofStatuses): string | undefined {
  const done = segments.filter((s) => s.tone === 'done' && proofs?.[s.id]);
  if (!done.length) return undefined;
  const verified = done.filter((s) => proofs?.[s.id] === 'verified').length;
  return verified === done.length ? 'all verified' : `${verified} verified`;
}

/** The trail in one line: "9 of 15 done · all verified · 2 at work · 1 needs you · 3 not started". */
export function progressWords(c: TrailCounts, segments: TrailSegment[], proofs?: ProofStatuses): MetaPart[] {
  return [
    { text: `${c.done} of ${c.total} done`, strong: true },
    verifiedWords(segments, proofs) ?? '',
    c.working > 0 ? `${c.working} at work` : '',
    c.needs > 0 ? { text: `${c.needs} ${plural(c.needs, 'needs', 'need')} you`, urgent: true } : '',
    c.waiting > 0 ? `${c.waiting} waiting for an agent` : '',
    c.notStarted > 0 ? `${c.notStarted} not started` : '',
  ];
}
