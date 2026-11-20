import { randomUUID } from 'node:crypto';
import type { TrackerAdapter } from '../adapters/adapter';
import { readTicketSync } from '../evidence/syncStore';
import { journalFile } from '../history/journalFile';
import type { AnswerVia } from '../model/answerVia';
import { highRiskRefusal } from '../model/highRiskRefusal';
import { type MergeAcceptance, PR_HEAD_MOVED } from '../model/mergeAnyway';
import type { Proof } from '../model/proof';
import type { Ticket } from '../model/types';
import { recordDecision } from '../planning/operations/decisionOps';
import { OperationError } from '../planning/operations/operationError';
import { needsLookout } from '../policy/needsLookout';
import { ticketNeedsLookout } from '../policy/ticketNeedsLookout';
import { gapsHash } from './gapsHash';
import { mergeAcceptances } from './mergeAcceptances';
import { type MergeHead, mergeHead } from './mergeHead';
import { proofForTicket } from './proofForTicket';

export interface MergeAnywayRequest {
  mapId: string;
  ticketId: string;
  /** The proof's gaps exactly as the page showed them. */
  gaps: string[];
  /**
   * The pull request's head as the page showed it: what is accepted when the proof names no commit, refused once the
   * pull request moved on. Unused when the proof names one.
   */
  head?: string;
  /** The person, when the sign-in named them. */
  person?: string;
  /** How the trail lead gave it, set by the route (lookoutVia.ts). */
  via: AnswerVia;
}

const TRAIL_LEAD = 'trail lead';

/**
 * The trail lead's "Merge anyway" on a done ticket whose proof isn't verified: they accept its gaps, as the page showed
 * them, for the commit the proof covers; when it names none (finished with no checks set), for its open pull request's
 * head exactly as the page showed it (`head`, refused when PR sync has a newer one). Kept in the machine store (mergeAcceptances.ts), as their decision, in the
 * trail's journal and as a comment on the ticket. Teamtrail merges nothing itself: a server that merges pull requests
 * (the Lookout's `managed.merge`) asks for this record, by its `gapsHash`, before merging an unverified ticket.
 * Never from Slack or an agent's chat; on a high-risk ticket only a Lookout caller allowed high-risk calls.
 */
export async function mergeAnyway(
  env: { adapter: TrackerAdapter; root: string },
  r: MergeAnywayRequest,
): Promise<{ acceptance: string; gapsHash: string; decisionId?: string; head: string; atPrHead?: true }> {
  if (r.via === 'slack' || r.via === 'chat') throw new OperationError('Merge anyway is for the Lookout only.');
  const snap = await env.adapter.loadMap(r.mapId);
  const t = snap.tickets.find((x) => x.id === r.ticketId);
  if (!t) throw new OperationError(`ticket ${r.ticketId} not found`);
  if (t.state !== 'closed' || t.closeReason !== 'completed') throw new OperationError(`${t.key} isn't done.`);
  const proof = proofForTicket({
    root: env.root,
    snap,
    ticket: t,
    decisions: await env.adapter.listDecisions(r.mapId),
  });
  const at = mergeableHead({ root: env.root, mapId: r.mapId, proof, t, shown: r.head });
  if (JSON.stringify(proof.gaps) !== JSON.stringify(r.gaps))
    throw new OperationError(`${t.key}'s proof changed since you looked: look again.`);
  await assertMayMerge(env.root, { mapId: r.mapId, ticket: t, attemptId: proof.attempt?.id, via: r.via });
  const { head } = at;
  const a: MergeAcceptance = {
    v: 1,
    id: `M-${randomUUID().slice(0, 8)}`,
    mapId: r.mapId,
    ticketId: t.id,
    ticketKey: t.key,
    head,
    ...(at.atPrHead ? { atPrHead: true as const, ...(at.pr ? { pr: at.pr } : {}) } : {}),
    gaps: proof.gaps,
    gapsHash: gapsHash({ head, gaps: proof.gaps }),
    by: r.person ?? TRAIL_LEAD,
    via: r.via,
    at: Date.now(),
  };
  const decisionId = await keep(env, { a, t, person: r.person });
  return { acceptance: a.id, gapsHash: a.gapsHash, decisionId, head, ...(a.atPrHead ? { atPrHead: true } : {}) };
}

/**
 * The head an unverified proof is accepted at: its commit; when it names none, its open pull request's head, which
 * must be the one the page showed. A verified proof has nothing to accept.
 */
function mergeableHead(o: { root: string; mapId: string; proof: Proof; t: Ticket; shown?: string }): MergeHead {
  const key = o.t.key;
  if (o.proof.status === 'verified') throw new OperationError(`${key} is verified: approve and merge it as it is.`);
  const at = mergeHead({ proof: o.proof, pr: readTicketSync(o.root, o.mapId, o.t.id)?.pr });
  if (!at) throw new OperationError(`${key}'s proof names no commit and it has no open pull request to merge at.`);
  if (!at.atPrHead) return at;
  if (!o.shown)
    throw new OperationError(`${key}'s proof names no commit: say which head of its pull request you accept.`);
  if (o.shown !== at.head) throw new OperationError(PR_HEAD_MOVED);
  return at;
}

async function assertMayMerge(root: string, o: { mapId: string; ticket: Ticket; attemptId?: string; via: AnswerVia }) {
  const high =
    needsLookout.approval(root, { mapId: o.mapId, ticketId: o.ticket.id, attemptId: o.attemptId }) ||
    (await ticketNeedsLookout(root, o.mapId, o.ticket.id));
  if (high && o.via !== 'lookout') throw new OperationError(highRiskRefusal(o.ticket.key, o.via));
}

/** The record in the machine store first (a config dir that can't be written refuses it), then the decision. */
async function keep(
  env: { adapter: TrackerAdapter; root: string },
  o: { a: MergeAcceptance; t: Ticket; person?: string },
) {
  const { a, t } = o;
  mergeAcceptances.add(env.root, a);
  const accepted = a.gaps.join(' ');
  const decision = await recordDecision(
    env.adapter,
    a.mapId,
    {
      ticketId: t.id,
      ticketKey: t.key,
      ...decisionWords(a, accepted),
      rationale: `Accepted the gaps the proof showed: ${accepted}`,
      decidedBy: TRAIL_LEAD,
      ...(o.person ? { decidedByName: o.person } : {}),
      source: { kind: 'lookout', ref: `merge:${a.id}`, label: 'Merged anyway' },
      transcript: [],
    },
    { guard: { via: a.via, highRisk: () => false } },
  );
  journalFile(env.root).append({
    v: 1,
    kind: 'merge-anyway',
    at: a.at,
    mapId: a.mapId,
    ticketId: t.id,
    ticketKey: t.key,
    acceptance: a.id,
    head: a.head,
    ...(a.atPrHead ? { atPrHead: true as const } : {}),
    gaps: a.gaps,
    actor: a.by,
    actorKind: 'trail lead',
  });
  const lines = a.gaps.map((g) => `- ${g}`).join('\n');
  const where = a.atPrHead ? ` at the pull request's head \`${a.head}\`, without a verified proof` : '';
  await env.adapter.comment(a.mapId, t.id, TRAIL_LEAD, `**Merge anyway**\n\nAccepted by ${a.by}${where}:\n\n${lines}`);
  return decision.id;
}

/**
 * The decision's question, answer and summary. At the pull request's head they say so plainly, with the head, since
 * the summary is what the proof (and the comment posted with it) shows of the decision.
 */
function decisionWords(a: MergeAcceptance, accepted: string) {
  const t = a.ticketKey;
  if (!a.atPrHead)
    return {
      question: `Merge ${t} at ${a.head.slice(0, 12)} though its proof isn't verified?`,
      answer: `Merge anyway, accepting: ${accepted}`,
      summary: `Chose to merge ${t} anyway, without a verified proof`,
    };
  const pr = a.pr ? `pull request #${a.pr}` : 'its pull request';
  return {
    question: `Merge ${t}'s ${pr} at its head ${a.head} though its proof names no commit and isn't verified?`,
    answer: `Merge anyway at head ${a.head}, accepting: ${accepted}`,
    summary: `Merge anyway accepted at head ${a.head} without a verified proof`,
  };
}
