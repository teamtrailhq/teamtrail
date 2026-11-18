import type { TicketPhase } from '../model/lifecycle';
import type { GapStanding, ProofGapItem, ProofGapKind } from '../model/proofGap';

/** What a ticket's gaps are judged against, besides the gaps themselves. */
export interface GapContext {
  /** Where the ticket is now. */
  phase: TicketPhase;
  /** The trail lead's criteria for the ticket are confirmed on this machine now. */
  criteriaConfirmed: boolean;
  /** A review ticket of it is open; `otherModel` when it waits for an agent on another model. */
  review?: { open: boolean; otherModel?: boolean };
  /** Who accepted the attempt as it is (the trail lead's PASS on it, or their Merge anyway of exactly these gaps). */
  acceptedBy?: string;
}

type Stand = Omit<GapStanding, 'kind' | 'text'>;
type Judge = (c: GapContext) => Stand;

const agent = (status: string): Stand => ({ owner: 'agent', status });
const you = (status: string, action: GapStanding['action']): Stand => ({ owner: 'you', status, action });
const nobody = (status: string): Stand => ({ owner: 'nobody', status });
const accepted = (c: GapContext, fallback: string): Stand =>
  c.acceptedBy ? { owner: 'accepted', status: `${c.acceptedBy} accepted it as it is.` } : nobody(fallback);

/** A new completion is the only way: nothing done to this attempt proves it after the fact. */
const NEW_COMPLETION = 'Only a new completion can prove it.';

/** Failed checks, criteria or a review: the agents rework it until they can't, then it's the human's. */
const fixedByRework: Judge = (c) => {
  switch (c.phase) {
    case 'blocked':
      return you('Needs you: the agents could not close it. Send it back, or accept it as it is.', 'rework');
    case 'done':
    case 'cancelled':
      return accepted(c, `Closed without it. ${NEW_COMPLETION}`);
    case 'verifying':
      return agent('Being checked again.');
    default:
      return agent('Back with an agent for rework.');
  }
};

/** A pass held by the flaky gate or the check guard: counting it is the human's call. */
const heldPass: Judge = (c) =>
  c.phase === 'blocked'
    ? you('Needs you: count the pass, or send it back to fix the cause.', 'accept-pass')
    : accepted(c, NEW_COMPLETION);

/** Criteria nobody confirmed: the human confirms them, and the work is checked again against them. */
const unconfirmed: Judge = (c) => {
  const closed = c.phase === 'done';
  if (c.criteriaConfirmed && closed)
    return you('Confirmed since: verify it again on the same commit to count them.', 'verify-again');
  if (c.criteriaConfirmed) return agent('Being checked again against the confirmed criteria.');
  if (closed)
    return you('Needs you: confirm the criteria, then it is verified again on the same commit.', 'confirm-and-verify');
  return you('Needs you: confirm the criteria. It is checked again by itself once you do.', 'confirm-criteria');
};

const review: Judge = (c) => {
  if (c.phase === 'done' || c.phase === 'cancelled') return accepted(c, `Closed without one. ${NEW_COMPLETION}`);
  if (c.review?.otherModel) return agent('Waiting for an agent on another model to review it.');
  if (c.review?.open) return agent('Waiting for an agent to review it.');
  return agent('A review is requested once its checks pass.');
};

const ruleUnanswered: Judge = (c) => {
  if (c.phase === 'verifying' || c.phase === 'blocked')
    return you('Send it back so the agent answers it; the diff-rules gate only observed.', 'rework');
  if (c.phase === 'done') return accepted(c, 'The diff-rules gate only observed. Set it to enforce to hold such work.');
  return agent('Back with an agent, who answers it.');
};

const approval: Judge = (c) =>
  c.phase === 'verifying' ? you('Needs you: approve it, or send it back.', 'approve') : accepted(c, NEW_COMPLETION);

/** What each kind of gap waits on, and what the human can do when it's theirs. */
const JUDGES: Record<ProofGapKind, Judge> = {
  'no-completion': () => nobody('Closed without a completion: there is nothing to check.'),
  reopened: () => agent('Reopened: back with an agent, and a new completion proves it.'),
  'verification-off': () => nobody(`Verification was off for it. ${NEW_COMPLETION}`),
  'remote-unchecked': () => nobody(`No runner checked it. ${NEW_COMPLETION}`),
  'runner-no-commit': () => nobody(`The runner named no commit. ${NEW_COMPLETION}`),
  'checks-failed': fixedByRework,
  'criteria-missing-evidence': fixedByRework,
  'criteria-failed': fixedByRework,
  'review-not-pass': fixedByRework,
  'known-failures': () => ({
    owner: 'main',
    status: 'Waiting for main: it fails there too. A completion after main is fixed proves it.',
    action: 'open-main-checks',
  }),
  'waived-check': () => ({
    owner: 'accepted',
    status: 'Accepted without it. Running it again sends the ticket back to the queue.',
    action: 'undo-waiver',
  }),
  retried: heldPass,
  'check-guard': heldPass,
  'criteria-unconfirmed': unconfirmed,
  'rule-unanswered': ruleUnanswered,
  'rule-waived': (c) => accepted(c, 'Accepted without an answer.'),
  'no-independent-review': review,
  'trail-lead-not-approved': approval,
};

/**
 * Who is on each of a proof's gaps and what closes it: an agent (rework, a review), main's fix, the human (with the
 * Lookout action that is theirs), an acceptance already made, or nobody, since a past attempt is never rewritten.
 * Pure and deterministic: the same gaps and context always give the same answer.
 */
export function gapPlan(gaps: ProofGapItem[], c: GapContext): GapStanding[] {
  return gaps.map((g) => ({ ...g, ...JUDGES[g.kind](c) }));
}
