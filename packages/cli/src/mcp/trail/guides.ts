import {
  checkChecklist,
  checklistProblem,
  OperationError,
  resolveGuide,
  guideProblem,
  guidePayload,
  type ChecklistAnswer,
  type InstalledGuide,
  type MapSnapshot,
  type Ticket,
  type TicketType,
} from '@teamtrail/core';
import { listGuides, writeChecklist } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/**
 * What a ticket's guide adds to a claim or a listing: the guide to act in (instructions, checklist, required checks),
 * or a warning when the ticket asks for a guide agents can't use now. Nothing for tickets without a guide.
 */
export function guideView(root: string, t: Ticket) {
  if (!t.guide) return {};
  const r = resolveGuide(listGuides(root), t);
  if (r.kind === 'active') return { guide: guidePayload(r.guide) };
  if (r.kind === 'none') return {};
  return {
    guideWarning: `This ticket asks for guide ${r.id}, which can't be used now (${r.reason}). Work it without guide instructions; the human has been told.`,
  };
}

/** Refuses a guide that isn't installed and active, or isn't made for `type`; the error lists the usable guides. */
export function assertGuide(guides: InstalledGuide[], id: string, type?: TicketType) {
  const problem = guideProblem(guides, id, type);
  if (problem) throw new OperationError(problem);
}

/** Ticket ids `guides` rules out: with a guides filter, only tickets whose guide is in it can be picked. */
export const outsideGuides = (snap: MapSnapshot, guides?: string[]) =>
  guides?.length ? snap.tickets.filter((t) => !t.guide || !guides.includes(t.guide)).map((t) => t.id) : [];

/** A named ticket outside the agent's guides filter is refused rather than silently swapped. */
export function assertInGuides(t: Ticket, guides?: string[]) {
  if (guides?.length && !(t.guide && guides.includes(t.guide)))
    throw new OperationError(
      `${t.key} has ${t.guide ? `guide ${t.guide}` : 'no guide'}, not one of ${guides.join(', ')}`,
    );
}

/**
 * The checklist a completion must answer: when the ticket's guide is active and has one, every item needs an answer
 * (presence, not truth), else the completion is refused with what's missing. Returns the record to keep.
 */
export function checkedAnswers(
  ctx: AgentContext,
  input: { snap: MapSnapshot; ticket: Ticket; given?: ChecklistAnswer[] },
) {
  const r = resolveGuide(listGuides(ctx.root), input.ticket);
  if (r.kind !== 'active' || !r.guide.checklist.length) return undefined;
  const c = checkChecklist(r.guide.checklist, input.given);
  const problem = checklistProblem(r.guide, c);
  if (problem) throw new OperationError(problem);
  return { guide: { id: r.guide.id, version: r.guide.version }, answers: c.answers };
}

/** Keeps a ticket's checklist answers next to its evidence, where the Lookout shows them. */
export async function keepAnswers(
  ctx: AgentContext,
  at: { snap: MapSnapshot; ticket: Ticket; checked?: ReturnType<typeof checkedAnswers> },
) {
  if (!at.checked) return;
  writeChecklist(ctx.root, {
    v: 1,
    mapId: at.snap.map.id,
    ticketId: at.ticket.id,
    ...at.checked,
    by: await ctx.agentId(),
    at: Date.now(),
  });
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
    note: 'Only the human installs, approves or removes guides. Give a ticket a guide with add_ticket or start_trail.',
  };
}
