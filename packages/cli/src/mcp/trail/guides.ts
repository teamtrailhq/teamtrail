import {
  guideProblem,
  guidesPayload,
  OperationError,
  resolveGuides,
  ticketGuideIds,
  type InstalledGuide,
  type MapSnapshot,
  type Ticket,
  type TicketType,
} from '@teamtrail/core';
import { listGuides } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/**
 * What a ticket's guides add to a claim or a listing: every guide it takes on (by its type on the trail, or added to
 * it), each with instructions, checklist and required checks, and a warning for each one agents can't use now.
 * Nothing for a ticket without guides.
 */
export function guideView(root: string, snap: MapSnapshot, t: Ticket) {
  const resolved = resolveGuides(listGuides(root), { map: snap.map, ticket: t });
  if (!resolved.length) return {};
  const { guides, warnings } = guidesPayload(resolved);
  const omitted = guides.some((g) => g.instructionsOmitted)
    ? {
        guidesNote:
          'Some guides came without their instructions (too long for one claim); their checklists still apply.',
      }
    : {};
  return { guides, ...(warnings.length ? { guideWarnings: warnings } : {}), ...omitted };
}

/** Refuses a guide that isn't installed and active, or isn't made for `type`; the error lists the usable guides. */
export function assertGuide(guides: InstalledGuide[], id: string, type?: TicketType) {
  const problem = guideProblem(guides, id, type);
  if (problem) throw new OperationError(problem);
}

const idsOf = (snap: MapSnapshot, t: Ticket) => ticketGuideIds(snap.map, t).map((r) => r.id);
const within = (ids: string[], guides: string[]) => ids.some((id) => guides.includes(id));

/** Ticket ids `guides` rules out: with a guides filter, only tickets taking one of those guides can be picked. */
export const outsideGuides = (snap: MapSnapshot, guides?: string[]) =>
  guides?.length ? snap.tickets.filter((t) => !within(idsOf(snap, t), guides)).map((t) => t.id) : [];

/** A named ticket outside the agent's guides filter is refused rather than silently swapped. */
export function assertInGuides(snap: MapSnapshot, t: Ticket, guides?: string[]) {
  if (!guides?.length) return;
  const ids = idsOf(snap, t);
  if (within(ids, guides)) return;
  const has = ids.length ? `guides ${ids.join(', ')}` : 'no guides';
  throw new OperationError(`${t.key} has ${has}, none of ${guides.join(', ')}`);
}

/** `list_guides`: the guides agents can use, what they handle and what they ask; disabled ones only by id and reason. */
export function listGuidesView(ctx: AgentContext, _input: object = {}) {
  const guides = listGuides(ctx.root);
  return {
    guides: guides
      .filter((r) => r.status === 'active' && r.guide)
      .map((r) => ({
        id: r.id,
        name: r.guide!.name,
        version: r.guide!.version,
        summary: r.guide!.summary,
        handles: r.guide!.handles.types,
        checklistItems: r.guide!.checklist.length,
        requiredChecks: r.guide!.requiresChecks,
        ...(r.guide!.preferredAgent ? { preferredAgent: r.guide!.preferredAgent } : {}),
        builtIn: r.origin === 'builtin',
      })),
    unavailable: guides.filter((r) => r.status !== 'active').map((r) => ({ id: r.id, reason: r.reason ?? r.status })),
    note: "Tickets take their type's guides from the trail, set by the human. Only the human installs, approves or removes guides, or changes a trail's or a ticket's guides; add_ticket's guide adds one more to a new ticket.",
  };
}
