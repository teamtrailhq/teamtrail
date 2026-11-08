import type { IncomingMessage, ServerResponse } from 'node:http';
import { approveCheck } from '../guides/approveCheck';
import { readChecklist } from '../guides/checklistStore';
import { guideProblem } from '../guides/guideProblem';
import { listGuides } from '../guides/guideStore';
import { approveGuide } from '../guides/installGuide';
import { removeGuide } from '../guides/removeGuide';
import { setTicketGuide } from '../planning/lifecycle/setTicketGuide';
import { setTrailTeam } from '../planning/lifecycle/setTrailTeam';
import { OperationError } from '../planning/operations/operationError';
import { handleGuideCatalog } from './guideCatalogRoutes';
import { journalGuide, guidesView, TRAIL_LEAD } from './guideJournal';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

const str = (v: unknown, name: string) => {
  if (typeof v !== 'string' || !v) throw new BadRequest(`"${name}" is required`);
  return v;
};

/** The trail lead's guide actions on the project: approve a file as it is, approve a check, remove a guide. */
async function projectAction(ctx: RouteContext, req: IncomingMessage, path: string) {
  const b = await readJson<{ id?: unknown; name?: unknown }>(req, '{}');
  const id = str(b.id, 'id');
  if (path === '/guides/approve') {
    const r = approveGuide({ root: ctx.root, id, by: TRAIL_LEAD });
    journalGuide(ctx.root, { action: 'approved', guide: id, version: r.guide.version });
  } else if (path === '/guides/checks/approve') {
    const r = approveCheck({ root: ctx.root, id, name: str(b.name, 'name') });
    journalGuide(ctx.root, { action: 'check-approved', guide: id, version: r.version, check: r.check });
  } else {
    removeGuide({ root: ctx.root, id });
    journalGuide(ctx.root, { action: 'removed', guide: id });
  }
}

/** A ticket's guide, or a trail's team; every id must be an active guide (and, for a ticket, made for its type). */
async function trailAction(ctx: RouteContext, req: IncomingMessage, path: string) {
  const b = await readJson<{ mapId?: unknown; ticketId?: unknown; guide?: unknown; guides?: unknown }>(req, '{}');
  const mapId = str(b.mapId, 'mapId');
  const adapter = await ctx.active();
  const guides = listGuides(ctx.root);
  if (path === '/guides/team') {
    const team = Array.isArray(b.guides) ? b.guides.filter((r): r is string => typeof r === 'string') : [];
    const problem = team.map((id) => guideProblem(guides, id)).find(Boolean);
    if (problem) throw new BadRequest(problem);
    await setTrailTeam(adapter, mapId, team, 'trail lead');
    return journalGuide(ctx.root, { action: 'team', guide: team.join(', '), mapId });
  }
  const ticketId = str(b.ticketId, 'ticketId');
  const guide = b.guide === null || b.guide === '' ? null : str(b.guide, 'guide');
  const t = (await adapter.loadMap(mapId)).tickets.find((x) => x.id === ticketId);
  if (!t) throw new BadRequest(`ticket ${ticketId} not found`);
  const problem = guide ? guideProblem(guides, guide, t.type) : undefined;
  if (problem) throw new BadRequest(problem);
  await setTicketGuide(adapter, { mapId, ticketId }, guide, 'trail lead');
  journalGuide(ctx.root, { action: 'ticket-guide', guide: guide ?? '', mapId, ticketId });
}

/**
 * `/guides`, the trail lead's side of guides (agents only read them, over MCP). GET `/guides` lists them; POST
 * `/guides/approve { id }`, `/guides/checks/approve { id, name }` and `/guides/remove { id }` act on the project;
 * POST `/guides/ticket { mapId, ticketId, guide|null }` and `/guides/team { mapId, guides }` on a trail. GET
 * `/guides/checklist?mapId&ticketId` is a ticket's latest checklist answers. Catalog routes are in guideCatalogRoutes.ts.
 * Every write is journaled; a refused one answers 409 with the reason.
 */
export async function handleGuides(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  const p = url.pathname;
  if (!p.startsWith('/guides')) return false;
  if (p === '/guides' && req.method === 'GET') return (sendJson(res, 200, guidesView(ctx.root)), true);
  if (p === '/guides/checklist' && req.method === 'GET') {
    const rec = readChecklist(ctx.root, url.searchParams.get('mapId') ?? '', url.searchParams.get('ticketId') ?? '');
    return (sendJson(res, 200, { checklist: rec ?? null }), true);
  }
  if (p.startsWith('/guides/catalog')) return handleGuideCatalog(ctx, req, res, url);
  if (req.method !== 'POST') return false;
  try {
    if (['/guides/approve', '/guides/checks/approve', '/guides/remove'].includes(p)) await projectAction(ctx, req, p);
    else if (p === '/guides/ticket' || p === '/guides/team') await trailAction(ctx, req, p);
    else return false;
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    return (sendJson(res, 409, { error: e.message }), true);
  }
  sendJson(res, 200, guidesView(ctx.root));
  return true;
}
