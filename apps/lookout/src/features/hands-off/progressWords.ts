import type { LabelPart } from '../../lib/labelParts';
import type { ProofStatuses } from '../map';
import type { TrailCounts, TrailSegment } from '../trail-bar';

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

/**
 * Progress's label line: the destination reached, how many are done and whether they are verified ("9 of 15 done ·
 * all verified"). What is at work, and what needs you, are said once each: in the rows under it and in Needs you.
 */
export function progressLabel(input: {
  counts: TrailCounts;
  segments: TrailSegment[];
  proofs?: ProofStatuses;
  reached: boolean;
}): LabelPart[] {
  const verified = verifiedWords(input.segments, input.proofs);
  const parts: LabelPart[] = [];
  if (input.reached) parts.push({ text: 'Destination reached', tone: 'ok' });
  parts.push(`${input.counts.done} of ${input.counts.total} done`);
  if (verified) parts.push({ text: verified, tone: verified === 'all verified' ? 'ok' : 'plain' });
  return parts;
}
