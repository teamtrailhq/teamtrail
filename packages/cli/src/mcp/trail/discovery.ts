import {
  OperationError,
  submitted,
  type BriefSections,
  type DiscoveryBrief,
  type MapSnapshot,
  type Ticket,
} from '@teamtrail/core';
import { claimableNow, discoveryRefusal, readBrief, writeBrief } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/** What the agent should do next, per brief status. */
const BRIEF_NEXT: Record<DiscoveryBrief['status'], string> = {
  accepted:
    'Brief accepted: implementation tickets can be claimed. Revise the planned tickets if the brief changed the picture.',
  submitted: 'Waiting for the human to review the brief in the Lookout. Work research and junction tickets meanwhile.',
  'changes-requested': 'The human asked for changes: revise the brief and submit_brief again.',
  draft: 'Claim the discovery ticket, investigate, and call submit_brief.',
};

/** What agents see about a trail's discovery step in claim, next, resume and start results. */
export function briefView(root: string, snap: MapSnapshot) {
  const b = readBrief(root, snap.map.id);
  if (!b) return null;
  const ticket = b.ticketId && snap.tickets.find((t) => t.id === b.ticketId);
  return {
    status: b.status,
    ticket: ticket ? ticket.key : undefined,
    ...(b.note ? { changesRequested: b.note } : {}),
    implementationClaimable: b.status === 'accepted',
    next: BRIEF_NEXT[b.status],
  };
}

/** Ticket types an agent may pick on this trail right now (`undefined`: any). */
export const claimable = (root: string, mapId: string) => claimableNow(root, mapId);

/** Throws when the discovery gate holds `t` back: every trail, unless the trail lead skipped discovery here. */
export function assertClaimable(root: string, mapId: string, t: Ticket) {
  const reason = discoveryRefusal(root, mapId, t.type);
  if (reason) throw new OperationError(reason);
}

export async function submitBrief(
  ctx: AgentContext,
  input: { trail?: string } & Partial<Omit<BriefSections, 'assumptions'>> & { assumptions?: string[] },
) {
  const snap = await ctx.resolveTrail(input.trail);
  const prev = readBrief(ctx.root, snap.map.id);
  if (prev?.status === 'accepted')
    throw new OperationError('The brief is already accepted. Record later findings with record_decision.');
  const sections: BriefSections = {
    summary: input.summary ?? '',
    productContext: input.productContext ?? '',
    existing: input.existing ?? '',
    conventions: input.conventions ?? '',
    dataModel: input.dataModel ?? '',
    api: input.api ?? '',
    risks: input.risks ?? '',
    assumptions: (input.assumptions ?? []).map((text, i) => ({ id: `A-${i + 1}`, text })),
    openQuestions: input.openQuestions ?? [],
  };
  if (!sections.summary.trim() || !sections.existing.trim())
    throw new OperationError('A brief needs at least a summary and the existing implementation (with real paths).');
  const agent = await ctx.agentId();
  writeBrief(ctx.root, submitted(prev, { mapId: snap.map.id, sections, author: agent }));
  ctx.sessions.current?.log('discovery brief submitted for review', 'ok');
  return { brief: briefView(ctx.root, snap), lookout: ctx.lookout() };
}

export async function getBrief(ctx: AgentContext, input: { trail?: string }) {
  const snap = await ctx.resolveTrail(input.trail);
  const b = readBrief(ctx.root, snap.map.id);
  return b
    ? { ...briefView(ctx.root, snap), sections: b.sections }
    : { brief: null, note: 'This trail has no discovery step.' };
}
