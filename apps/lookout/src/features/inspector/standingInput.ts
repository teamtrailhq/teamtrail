import {
  attention,
  DISCOVERY_TYPES,
  flakyReason,
  heldAsFlaky,
  leaseHealth,
  type VerificationVerdict,
} from '@teamtrail/core';
import { checkOk, type TicketVerification } from '../../lib/verification';
import { edgeFor } from '../attention';
import type { LatestAttempt, LoadedTicket, StandingInput } from './types';

/** The fields changed outside Teamtrail, in words. */
const HELD_FIELDS = (fields: string[]) =>
  fields[0] === 'added' ? 'added outside Teamtrail' : fields.map((f) => (f === 'words' ? 'its words' : f)).join(', ');

/** The state line's input, read from what the inspector loaded for the ticket. */
export function standingInput(v: LoadedTicket): StandingInput {
  const { t, snap } = v;
  const first = v.items[0];
  const byId = new Map(snap.tickets.map((x) => [x.id, x]));
  const latest = v.verification?.attempts[0];
  const lease = v.lease && {
    agent: v.lease.agent,
    renewedAt: v.lease.renewedAt,
    expiresAt: v.lease.expiresAt,
    health: leaseHealth(v.lease, v.now),
  };
  return {
    state: v.state,
    now: v.now,
    question: v.question && { agent: v.question.agent, at: v.question.at },
    item: first && { kind: first.kind, edge: edgeFor(first, v.interrupting.includes(first.id)) },
    outsideChange: v.change && `${HELD_FIELDS(v.change.fields)} · held until you accept or revert it`,
    lease,
    assignee: t.assignee,
    mine: v.mine,
    hitl: attention(t) === 'hitl',
    briefHeld: briefHeld(v),
    modelWait: v.modelWait && { tier: v.modelWait.tier, best: v.modelWait.best },
    running: v.verification?.running,
    latest: latest && latestOf(latest),
    sentBack: sentBack(v.verification),
    reviewWaits: reviewWaits(v.verification),
    verified: v.proof && v.proof.proof.status === 'verified',
    pr: v.pr?.pr && { number: v.pr.pr.number, state: v.pr.pr.state },
    openBlockers: t.blockedBy.filter((b) => byId.get(b)?.state === 'open').map((b) => byId.get(b)?.key ?? b),
    closedAt: t.closedAt,
  };
}

function briefHeld(v: LoadedTicket): StandingInput['briefHeld'] {
  if (!v.brief || v.state !== 'frontier' || DISCOVERY_TYPES.includes(v.t.type)) return undefined;
  return v.brief.status === 'submitted' ? 'submitted' : 'writing';
}

function latestOf(a: TicketVerification['attempts'][number]): LatestAttempt {
  const failed = a.checks.filter((c) => !checkOk(c)).map((c) => c.name);
  const retried = a.flaky && heldAsFlaky(a) ? flakyReason(a.flaky.checks) : undefined;
  return { result: a.result, agent: a.agent, failed, ...(retried ? { retried } : {}) };
}

const SENT_BACK: Partial<Record<VerificationVerdict['verdict'], string>> = {
  FAIL: 'the review sent it back',
  NEEDS_HUMAN: 'the reviewer asked for you',
};

/** The latest verdict on the latest completion, when it sent the work back or asked for the human. */
function sentBack(data?: TicketVerification) {
  const latest = data?.attempts[0];
  const verdict = latest && data.verdicts.find((d) => d.attemptId === latest.id);
  return verdict && SENT_BACK[verdict.verdict];
}

/** The level takes a review, the latest completion passed its checks, and no verdict on it yet. */
function reviewWaits(data?: TicketVerification) {
  const latest = data?.attempts[0];
  if (!latest || latest.result !== 'pass' || !data.level.level.includes('review')) return false;
  return !data.verdicts.some((d) => d.attemptId === latest.id);
}
