import {
  CRITERION_KINDS,
  criteriaRequired,
  numbered,
  OperationError,
  uncoveredRules,
  type CriterionKind,
  type MapSnapshot,
  type Ticket,
} from '@teamtrail/core';
import {
  chartedBy,
  discoverySkipped,
  readCriteria,
  readCriteriaProposals,
  writeCriteriaProposal,
  writeTicketCriteria,
} from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { knowledgeFor } from './knowledge';
import { assertOwnClaim } from './ownClaim';

export type CriterionInput = { text: string; kind: CriterionKind; source?: string };

/** Writes a ticket's criteria, numbered AC-1, AC-2, … (replacing earlier ones and clearing the trail lead's confirm). */
export function saveCriteria(root: string, map: { id: string; title: string }, t: Ticket, items: CriterionInput[]) {
  return writeTicketCriteria(root, map, t, { criteria: checkedCriteria(items) });
}

/** A criterion's source is a knowledge entry id (K-3): nothing else, so it can't smuggle a path or a sentence. */
const SOURCE = /^K-\d+$/;

function checkedCriteria(items: CriterionInput[]) {
  const bad = items.find((c) => !CRITERION_KINDS.includes(c.kind) || !c.text.trim());
  if (bad) throw new OperationError(`each criterion needs text and a kind (${CRITERION_KINDS.join(', ')})`);
  const source = items.find((c) => c.source !== undefined && !SOURCE.test(c.source.trim()));
  if (source) throw new OperationError(`a criterion's source is a knowledge entry id like K-3, not "${source.source}"`);
  return numbered(items.map((c) => ({ ...c, ...(c.source ? { source: c.source.trim() } : {}) })));
}

/** What an agent sees about a ticket's criteria: the list, whether they're required, and business rules to cover. */
export function criteriaView(root: string, snap: MapSnapshot, t: Ticket, level: string) {
  const entry = readCriteria(root, snap.map.id).find((x) => x.ticketId === t.id);
  const required = criteriaRequired(requiresCriteria(root, snap.map.id), t.type, level as never);
  const rules = (knowledgeFor(root, snap, t) ?? []).filter((k) => k.kind === 'business-rule');
  const uncovered = uncoveredRules(
    entry?.criteria ?? [],
    rules.map((r) => r.id),
  );
  if (!entry?.criteria.length && !required && !uncovered.length) return undefined;
  return {
    list: entry?.criteria ?? [],
    ...(entry?.confirmed ? { confirmedByHuman: true } : {}),
    ...(proposedCriteria(root, snap.map.id, t) ? { proposedChangeWaitingOnHuman: true } : {}),
    required,
    ...(required && !entry?.criteria.length
      ? { next: 'Write acceptance criteria with set_criteria before you start: what must be true for this to be done.' }
      : {}),
    ...(uncovered.length
      ? {
          suggested: rules
            .filter((r) => uncovered.includes(r.id))
            .map((r) => ({ text: r.title, kind: 'business-rule', source: r.id })),
        }
      : {}),
    evidence:
      "When completing, give evidence per criterion. Only check:<name> (from verification.json, run by Teamtrail) counts as verified. test:<name>, command:<cmd>, pr or a note are recorded as claimed, not verified, and the human sees them so; on security and business-rule criteria they need the human's sign-off. manual: the human signs off.",
  };
}

/**
 * `set_criteria`. Criteria are what done means, so not every agent may write them: the ticket's assignee, or,
 * before anyone claims it, the connection that charted it. Once the trail lead confirmed them, an agent only
 * proposes a change: the confirmed set stays in force (completions are checked against it) until the trail lead
 * takes the proposal in the Lookout.
 */
export async function setCriteria(
  ctx: AgentContext,
  input: { trail?: string; ticket: string; criteria: CriterionInput[] },
) {
  const snap = await ctx.resolveTrail(input.trail);
  const t = ctx.findTicket(snap, input.ticket);
  if (t.state === 'closed') throw new OperationError(`${t.key} is closed`);
  if (t.status === 'verifying')
    throw new OperationError(`${t.key} is being verified; its criteria are fixed until then`);
  const agent = await ctx.agentId();
  assertMayWriteCriteria(ctx, { snap, t, agent });
  const criteria = checkedCriteria(input.criteria);
  const current = readCriteria(ctx.root, snap.map.id).find((x) => x.ticketId === t.id);
  if (current?.confirmed) {
    writeCriteriaProposal(ctx.root, snap.map.id, {
      ticketId: t.id,
      ticketKey: t.key,
      criteria,
      by: agent,
      at: Date.now(),
    });
    ctx.sessions.current?.log(`${t.key}: proposed new acceptance criteria for the human`, 'warn', 'asks-you');
    return {
      ticket: t.key,
      proposed: criteria,
      inForce: current.criteria,
      note: 'The human confirmed these criteria, so yours are a proposal: the confirmed ones stay in force, and your completion is checked against them, until the human takes yours in the Lookout.',
    };
  }
  const saved = writeTicketCriteria(ctx.root, snap.map, t, { criteria });
  ctx.sessions.current?.log(`${t.key}: ${saved.criteria.length} acceptance criteria`, 'ok');
  return { ticket: t.key, criteria: saved.criteria };
}

function assertMayWriteCriteria(ctx: AgentContext, at: { snap: MapSnapshot; t: Ticket; agent: string }) {
  const { snap, t, agent } = at;
  if (t.assignee) return assertOwnClaim(ctx, { mapId: snap.map.id, ticket: t, agent });
  const charted = chartedBy(ctx.root, snap.map.id, t.id);
  // The charting connection: a remote agent by its token (so it may reconnect), a local one by that connection, as a
  // trail name is not an identity here. Once a local charting connection is gone, nobody charted it: claim it first.
  if (charted?.origin === ctx.origin) return;
  throw new OperationError(
    `${t.key}'s criteria are written by the agent that claims it, or by the one that charted it before anyone does. Claim ${t.key} first.`,
  );
}

/** Criteria are required on every trail that keeps its discovery step: all, unless the trail lead skipped it here. */
const requiresCriteria = (root: string, mapId: string) => !discoverySkipped(root, mapId);

/** A change an agent proposed to the ticket's confirmed criteria, still waiting on the human. */
export function proposedCriteria(root: string, mapId: string, t: Ticket) {
  return readCriteriaProposals(root, mapId).find((p) => p.ticketId === t.id);
}

/** Refuses a completion that needs criteria and has none. */
export function assertCriteria(root: string, snap: MapSnapshot, t: Ticket, level: string) {
  if (!criteriaRequired(requiresCriteria(root, snap.map.id), t.type, level as never)) return;
  if (readCriteria(root, snap.map.id).find((x) => x.ticketId === t.id)?.criteria.length) return;
  throw new OperationError(
    `${t.key} needs acceptance criteria before it can be completed: call set_criteria with what must be true, then complete it with evidence for each.`,
  );
}
