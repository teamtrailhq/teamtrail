import type { Proof } from '@teamtrail/core';
import type { MetaPart } from '../../components/ui';

const authorPart = (same: unknown, author?: string): MetaPart => {
  if (same) return 'the same model as the author';
  return author ? `author on ${author}` : 'author model unknown';
};

/**
 * Which model each agent review ran on against the author's: "Reviewed by codex-02 on gpt-5.1 · author on
 * claude-opus-5-5". A review on the author's own model says so. One line per review that reported a model.
 */
export function reviewModelParts(proof: Proof): MetaPart[][] {
  const author = proof.attempt.model;
  return proof.reviews
    .filter((r) => r.byKind === 'agent' && r.model)
    .map((r) => [`Reviewed by ${r.by} on ${r.model}`, authorPart(r.sameModel, author)]);
}
