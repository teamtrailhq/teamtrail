import { guidesPayload, resolveGuides, resolvedId, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { listGuides, readLease, renewLease } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/**
 * What changed in the guides of a ticket the agent holds since it was last told (its claim, or an earlier report):
 * guides added, with everything needed to act in them, and guides taken off. Told once: the lease then records
 * the guides as given. Nothing when nothing changed, or for a lease from before guides came by type.
 */
export async function guideChanges(ctx: AgentContext, at: { snap: MapSnapshot; ticket: Ticket }) {
  const agent = await ctx.agentId();
  const lease = readLease(ctx.root, at.snap.map.id, at.ticket.id);
  if (!lease || lease.agent !== agent) return {};
  const list = resolveGuides(listGuides(ctx.root), { map: at.snap.map, ticket: at.ticket });
  const now = list.map(resolvedId);
  const given = lease.guides;
  if (given && now.length === given.length && now.every((id) => given.includes(id))) return {};
  renewLease(ctx.root, { mapId: at.snap.map.id, ticketId: at.ticket.id, agent }, { guides: now });
  if (!given) return {};
  const added = guidesPayload(list.filter((r) => !given.includes(resolvedId(r)))).guides;
  const removed = given.filter((id) => !now.includes(id));
  return {
    guidesChanged: {
      ...(added.length ? { added } : {}),
      ...(removed.length ? { removed } : {}),
      note: 'The human changed the guides of this ticket. Work in the added ones too: their checklists are required at completion and their checks run. A removed guide no longer needs its checklist.',
    },
  };
}

/** The ids of the guides `t` takes on now, as a claim gives them and its lease records them. */
export const givenGuides = (root: string, snap: MapSnapshot, t: Ticket) =>
  resolveGuides(listGuides(root), { map: snap.map, ticket: t }).map(resolvedId);
