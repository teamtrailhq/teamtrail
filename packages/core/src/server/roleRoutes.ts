import type { IncomingMessage, ServerResponse } from 'node:http';
import { setTicketRole } from '../planning/lifecycle/setTicketRole';
import { setTrailTeam } from '../planning/lifecycle/setTrailTeam';
import { OperationError } from '../planning/operations/operationError';
import { approveCheck } from '../roles/approveCheck';
import { readChecklist } from '../roles/checklistStore';
import { approveRole } from '../roles/installRole';
import { removeRole } from '../roles/removeRole';
import { roleProblem } from '../roles/roleProblem';
import { listRoles } from '../roles/roleStore';
import { BadRequest, readJson, sendJson } from './http';
import { handleRoleCatalog } from './roleCatalogRoutes';
import { journalRole, rolesView, TRAIL_LEAD } from './roleJournal';
import type { RouteContext } from './routeContext';

const str = (v: unknown, name: string) => {
  if (typeof v !== 'string' || !v) throw new BadRequest(`"${name}" is required`);
  return v;
};

/** The trail lead's role actions on the project: approve a file as it is, approve a check, remove a role. */
async function projectAction(ctx: RouteContext, req: IncomingMessage, path: string) {
  const b = await readJson<{ id?: unknown; name?: unknown }>(req, '{}');
  const id = str(b.id, 'id');
  if (path === '/roles/approve') {
    const r = approveRole({ root: ctx.root, id, by: TRAIL_LEAD });
    journalRole(ctx.root, { action: 'approved', role: id, version: r.role.version });
  } else if (path === '/roles/checks/approve') {
    const r = approveCheck({ root: ctx.root, id, name: str(b.name, 'name') });
    journalRole(ctx.root, { action: 'check-approved', role: id, version: r.version, check: r.check });
  } else {
    removeRole({ root: ctx.root, id });
    journalRole(ctx.root, { action: 'removed', role: id });
  }
}

/** A ticket's role, or a trail's team; every id must be an active role (and, for a ticket, made for its type). */
async function trailAction(ctx: RouteContext, req: IncomingMessage, path: string) {
  const b = await readJson<{ mapId?: unknown; ticketId?: unknown; role?: unknown; roles?: unknown }>(req, '{}');
  const mapId = str(b.mapId, 'mapId');
  const adapter = await ctx.active();
  const roles = listRoles(ctx.root);
  if (path === '/roles/team') {
    const team = Array.isArray(b.roles) ? b.roles.filter((r): r is string => typeof r === 'string') : [];
    const problem = team.map((id) => roleProblem(roles, id)).find(Boolean);
    if (problem) throw new BadRequest(problem);
    await setTrailTeam(adapter, mapId, team, 'trail lead');
    return journalRole(ctx.root, { action: 'team', role: team.join(', '), mapId });
  }
  const ticketId = str(b.ticketId, 'ticketId');
  const role = b.role === null || b.role === '' ? null : str(b.role, 'role');
  const t = (await adapter.loadMap(mapId)).tickets.find((x) => x.id === ticketId);
  if (!t) throw new BadRequest(`ticket ${ticketId} not found`);
  const problem = role ? roleProblem(roles, role, t.type) : undefined;
  if (problem) throw new BadRequest(problem);
  await setTicketRole(adapter, { mapId, ticketId }, role, 'trail lead');
  journalRole(ctx.root, { action: 'ticket-role', role: role ?? '', mapId, ticketId });
}

/**
 * `/roles`, the trail lead's side of roles (agents only read them, over MCP). GET `/roles` lists them; POST
 * `/roles/approve { id }`, `/roles/checks/approve { id, name }` and `/roles/remove { id }` act on the project;
 * POST `/roles/ticket { mapId, ticketId, role|null }` and `/roles/team { mapId, roles }` on a trail. GET
 * `/roles/checklist?mapId&ticketId` is a ticket's latest checklist answers. Catalog routes are in roleCatalogRoutes.ts.
 * Every write is journaled; a refused one answers 409 with the reason.
 */
export async function handleRoles(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  const p = url.pathname;
  if (!p.startsWith('/roles')) return false;
  if (p === '/roles' && req.method === 'GET') return (sendJson(res, 200, rolesView(ctx.root)), true);
  if (p === '/roles/checklist' && req.method === 'GET') {
    const rec = readChecklist(ctx.root, url.searchParams.get('mapId') ?? '', url.searchParams.get('ticketId') ?? '');
    return (sendJson(res, 200, { checklist: rec ?? null }), true);
  }
  if (p.startsWith('/roles/catalog')) return handleRoleCatalog(ctx, req, res, url);
  if (req.method !== 'POST') return false;
  try {
    if (['/roles/approve', '/roles/checks/approve', '/roles/remove'].includes(p)) await projectAction(ctx, req, p);
    else if (p === '/roles/ticket' || p === '/roles/team') await trailAction(ctx, req, p);
    else return false;
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    return (sendJson(res, 409, { error: e.message }), true);
  }
  sendJson(res, 200, rolesView(ctx.root));
  return true;
}
