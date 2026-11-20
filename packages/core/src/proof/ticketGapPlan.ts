import { readCriteria } from '../criteria/criteriaStore';
import type { Proof } from '../model/proof';
import type { GapStanding } from '../model/proofGap';
import type { DecisionRecord, MapSnapshot, Ticket } from '../model/types';
import { ticketPhase } from '../planning/lifecycle/phase';
import { openReviews } from '../planning/lifecycle/reviewTicket';
import { trustedChecks } from '../verification/checksApproval';
import { gapPlan } from './gapPlan';
import { proofWithGaps } from './proofForTicket';

/**
 * A ticket's proof with who is on each of its gaps and what closes it (gapPlan.ts), judged from what this machine
 * recorded: where the ticket is, its criteria now, its open review, and who accepted it as it is (the trail lead's
 * PASS on the attempt, or `mergedAnywayBy`, their Merge anyway of exactly these gaps), and whether checks are set.
 */
export function ticketGapPlan(input: {
  root: string;
  snap: MapSnapshot;
  ticket: Ticket;
  decisions: DecisionRecord[];
  mergedAnywayBy?: string;
}): { proof: Proof; plan: GapStanding[] } {
  const { root, snap, ticket: t } = input;
  const { proof, gaps } = proofWithGaps(input);
  const phase = ticketPhase(t, new Map(snap.tickets.map((x) => [x.id, x])), snap.map.mode);
  const criteria = readCriteria(root, snap.map.id).find((c) => c.ticketId === t.id);
  const lead = proof.reviews.find((r) => r.byKind === 'trail lead' && r.verdict === 'PASS');
  const plan = gapPlan(gaps, {
    phase,
    criteriaConfirmed: criteria?.confirmed === true,
    review: {
      open: openReviews(snap, t.id).length > 0,
      otherModel: proof.reviews.some((r) => r.sameModel === 'held'),
    },
    checksSet: (trustedChecks(root).config.config?.run.length ?? 0) > 0,
    ...(lead || input.mergedAnywayBy ? { acceptedBy: lead?.by ?? input.mergedAnywayBy } : {}),
  });
  return { proof, plan };
}
