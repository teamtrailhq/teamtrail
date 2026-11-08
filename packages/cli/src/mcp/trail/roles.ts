import {
  checkChecklist,
  checklistProblem,
  OperationError,
  resolveRole,
  roleProblem,
  rolePayload,
  type ChecklistAnswer,
  type InstalledRole,
  type MapSnapshot,
  type Ticket,
  type TicketType,
} from '@teamtrail/core';
import { listRoles, writeChecklist } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/**
 * What a ticket's role adds to a claim or a listing: the role to act in (instructions, checklist, required checks),
 * or a warning when the ticket asks for a role agents can't use now. Nothing for tickets without a role.
 */
export function roleView(root: string, t: Ticket) {
  if (!t.role) return {};
  const r = resolveRole(listRoles(root), t);
  if (r.kind === 'active') return { role: rolePayload(r.role) };
  if (r.kind === 'none') return {};
  return {
    roleWarning: `This ticket asks for role ${r.id}, which can't be used now (${r.reason}). Work it without role instructions; the human has been told.`,
  };
}

/** Refuses a role that isn't installed and active, or isn't made for `type`; the error lists the usable roles. */
export function assertRole(roles: InstalledRole[], id: string, type?: TicketType) {
  const problem = roleProblem(roles, id, type);
  if (problem) throw new OperationError(problem);
}

/** Ticket ids `roles` rules out: with a roles filter, only tickets whose role is in it can be picked. */
export const outsideRoles = (snap: MapSnapshot, roles?: string[]) =>
  roles?.length ? snap.tickets.filter((t) => !t.role || !roles.includes(t.role)).map((t) => t.id) : [];

/** A named ticket outside the agent's roles filter is refused rather than silently swapped. */
export function assertInRoles(t: Ticket, roles?: string[]) {
  if (roles?.length && !(t.role && roles.includes(t.role)))
    throw new OperationError(`${t.key} has ${t.role ? `role ${t.role}` : 'no role'}, not one of ${roles.join(', ')}`);
}

/**
 * The checklist a completion must answer: when the ticket's role is active and has one, every item needs an answer
 * (presence, not truth), else the completion is refused with what's missing. Returns the record to keep.
 */
export function checkedAnswers(
  ctx: AgentContext,
  input: { snap: MapSnapshot; ticket: Ticket; given?: ChecklistAnswer[] },
) {
  const r = resolveRole(listRoles(ctx.root), input.ticket);
  if (r.kind !== 'active' || !r.role.checklist.length) return undefined;
  const c = checkChecklist(r.role.checklist, input.given);
  const problem = checklistProblem(r.role, c);
  if (problem) throw new OperationError(problem);
  return { role: { id: r.role.id, version: r.role.version }, answers: c.answers };
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

/** `list_roles`: the roles agents can use, what they handle and what they ask; disabled ones only by id and reason. */
export function listRolesView(ctx: AgentContext, _input: object = {}) {
  const roles = listRoles(ctx.root);
  return {
    roles: roles
      .filter((r) => r.status === 'active' && r.role)
      .map((r) => ({
        id: r.id,
        name: r.role!.name,
        version: r.role!.version,
        summary: r.role!.summary,
        handles: r.role!.handles.types,
        checklistItems: r.role!.checklist.length,
        requiredChecks: r.role!.requiresChecks,
        ...(r.role!.preferredAgent ? { preferredAgent: r.role!.preferredAgent } : {}),
        builtIn: r.origin === 'builtin',
      })),
    unavailable: roles.filter((r) => r.status !== 'active').map((r) => ({ id: r.id, reason: r.reason ?? r.status })),
    note: 'Only the human installs, approves or removes roles. Give a ticket a role with add_ticket or start_trail.',
  };
}
