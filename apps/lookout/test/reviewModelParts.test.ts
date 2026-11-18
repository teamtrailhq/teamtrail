import type { Proof } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { reviewModelParts } from '../src/features/proof/reviewModelParts';

const proof = (reviews: Proof['reviews'], model?: string) => ({ attempt: { model }, reviews }) as unknown as Proof;
const review = (r: Partial<Proof['reviews'][number]>): Proof['reviews'][number] => ({
  by: 'codex-02',
  byKind: 'agent',
  verdict: 'PASS',
  summary: 'fine',
  independent: true,
  ...r,
});

describe('reviewModelParts', () => {
  it("shows the reviewer's model against the author's", () => {
    expect(reviewModelParts(proof([review({ model: 'gpt-5.1-codex' })], 'claude-opus-5-5'))).toEqual([
      ['Reviewed by codex-02 on gpt-5.1-codex', 'author on claude-opus-5-5'],
    ]);
  });

  it('says when the reviewer ran the author model, and skips reviews with no model', () => {
    const reviews = [
      review({ by: 'claude-02', model: 'claude-opus-5-5', sameModel: 'held', independent: false }),
      review({ by: 'trail lead', byKind: 'trail lead' }),
      review({ by: 'codex-03' }),
    ];
    expect(reviewModelParts(proof(reviews, 'claude-opus-5-5'))).toEqual([
      ['Reviewed by claude-02 on claude-opus-5-5', 'the same model as the author'],
    ]);
  });
});
