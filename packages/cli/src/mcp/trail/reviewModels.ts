import { OperationError, sameModel, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { readAgentDocs } from '@teamtrail/core/agents';
import { reviewedWork, reviewGateMode } from '@teamtrail/core/node';
import type { AgentContext } from './agentContext';
import { sessionTier } from './models';

/**
 * The `independent-review` gate when offering reviews: a review of work done on this session's own model. With the
 * gate on, such reviews are offered after everything else, so an agent on another model takes them first. With it
 * enforcing, one `waits` (is never offered or taken) while an agent on another model is connected, or once a PASS on
 * this model was already held; with nobody else connected, it is still offered, so work never waits on it alone.
 */
export interface SameModelReview {
  ticket: Ticket;
  /** The model the author and this session share. */
  model: string;
  /** The reviewed ticket's key. */
  of: string;
  waits: boolean;
}

/** Models of the other agents connected now. */
async function connectedModels(ctx: AgentContext) {
  const own = ctx.sessions.running()?.id;
  return (await readAgentDocs(ctx.root))
    .filter((d) => d.session.status === 'running' && d.session.id !== own && d.session.model)
    .map((d) => d.session.model!);
}

export async function sameModelReviews(ctx: AgentContext, snap: MapSnapshot): Promise<SameModelReview[]> {
  const mine = sessionTier(ctx).model;
  const mode = reviewGateMode(ctx.root);
  if (!mine || mode === 'off') return [];
  const reviews = snap.tickets.filter((t) => t.type === 'review' && t.state === 'open' && t.reviewOf);
  if (!reviews.length) return [];
  const others = mode === 'enforce' ? await connectedModels(ctx) : [];
  return reviews.flatMap((ticket) => {
    const work = reviewedWork(ctx.root, snap.map.id, ticket);
    const model = sameModel(work.authorModel, mine);
    if (!model) return [];
    const otherModel = others.some((m) => !sameModel(m, model));
    const of = snap.tickets.find((x) => x.id === work.ticketId)?.key ?? ticket.reviewOf!;
    return [{ ticket, model, of, waits: mode === 'enforce' && (work.held || otherModel) }];
  });
}

/** Why a review this session may not take waits for another model, in the words the agent and the human see. */
export const waitsReason = (r: SameModelReview) =>
  `Review ${r.ticket.key} waits for an agent on another model than ${r.model}, the model that did ${r.of}`;

/** Refuses an explicit claim of a review that waits for an agent on another model. */
export function assertModelMayReview(reviews: SameModelReview[], t: Ticket) {
  const r = reviews.find((x) => x.ticket.id === t.id && x.waits);
  if (r) throw new OperationError(`You cannot take ${t.key}: ${waitsReason(r)}. Take other work.`);
}

/** On a claimed review of work done on this session's model: `reviewModel`, what that review will count for. */
export async function reviewModelNote(ctx: AgentContext, snap: MapSnapshot, t: Ticket) {
  if (t.type !== 'review') return {};
  const r = (await sameModelReviews(ctx, snap)).find((x) => x.ticket.id === t.id);
  if (!r) return {};
  const mode = reviewGateMode(ctx.root);
  const head = `You run ${r.model}, the model that did ${r.of}`;
  const reviewModel =
    mode === 'enforce'
      ? `${head}: a PASS from you won't count until an agent on another model reviews it or the human approves. Review it as strictly as you would another model's work.`
      : `${head}: your review is recorded as by the same model. Look hardest for what you would have missed writing it.`;
  return { reviewModel };
}
