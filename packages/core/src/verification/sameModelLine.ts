import type { VerificationVerdict } from '../model/verification';

/** What a review on the author's own model says under it, on the reviewed ticket; undefined for any other review. */
export function sameModelLine(v: Pick<VerificationVerdict, 'sameModel' | 'authorModel'>): string | undefined {
  if (!v.sameModel) return undefined;
  const on = `Reviewed on ${v.authorModel ?? 'the same model'}, the model that did the work`;
  if (v.sameModel === 'observed') return `${on}.`;
  return `${on}: this PASS doesn't count until an agent on another model reviews it or the trail lead approves.`;
}
