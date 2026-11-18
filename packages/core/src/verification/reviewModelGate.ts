import type { Ticket } from '../model/types';
import type { VerdictKind, VerificationAttempt, VerificationVerdict } from '../model/verification';
import { sameModel } from '../planning/matching/sameModel';
import { authorModelOf } from './authorModel';
import { recordGate } from './recordGate';
import { reviewGateMode } from './reviewGateMode';

/** What a verdict keeps about the models behind it. */
export type ReviewModels = Pick<VerificationVerdict, 'model' | 'authorModel' | 'sameModel'>;

/**
 * The `independent-review` gate on one review: the reviewer's and the author's models, and whether the reviewer ran
 * the author's model. Off: only the models are kept. Observe: the review counts and the gate is journaled. Enforce: a
 * PASS is `held`, it doesn't count until an agent on another model reviews or the trail lead approves. A FAIL or
 * NEEDS_HUMAN on the same model holds the work back anyway, so it stands and is only marked.
 */
export function reviewModelGate(o: {
  root: string;
  mapId: string;
  ticket: Pick<Ticket, 'id' | 'key'>;
  attempt: VerificationAttempt;
  reviewer: { agent: string; model?: string };
  verdict: VerdictKind;
}): ReviewModels {
  const authorModel = authorModelOf(o.root, o.attempt);
  const models: ReviewModels = {
    ...(o.reviewer.model ? { model: o.reviewer.model } : {}),
    ...(authorModel ? { authorModel } : {}),
  };
  const same = sameModel(authorModel, o.reviewer.model);
  if (!same) return models;
  const mode = reviewGateMode(o.root);
  if (mode === 'off') return models;
  if (o.verdict !== 'PASS') return { ...models, sameModel: 'observed' };
  const held = recordGate({
    root: o.root,
    mapId: o.mapId,
    gate: 'independent-review',
    mode,
    reason: `${o.reviewer.agent} reviewed ${o.ticket.key} on ${same}, the model that did the work`,
    ticket: o.ticket,
    actor: o.reviewer.agent,
    actorKind: 'agent',
  });
  return { ...models, sameModel: held ? 'held' : 'observed' };
}
