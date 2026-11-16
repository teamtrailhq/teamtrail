import type { IncomingMessage, ServerResponse } from 'node:http';
import { approveCheck } from '../guides/approveCheck';
import { readChecklist } from '../guides/checklistStore';
import { approveGuide } from '../guides/installGuide';
import { removeGuide } from '../guides/removeGuide';
import { OperationError } from '../planning/operations/operationError';
import { handleGuideCatalog } from './guideCatalogRoutes';
import { journalGuide, guidesView, TRAIL_LEAD } from './guideJournal';
import { guideTrailAction } from './guideTrailActions';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

const str = (v: unknown, name: string) => {
  if (typeof v !== 'string' || !v) throw new BadRequest(`"${name}" is required`);
  return v;
};

/**
 * The trail lead's guide actions on the project: approve a file as it was shown (`sha256`, the hash of the text the
 * page showed in full), approve a check, remove a guide.
 */
async function projectAction(ctx: RouteContext, req: IncomingMessage, path: string) {
  const b = await readJson<{ id?: unknown; name?: unknown; sha256?: unknown; acknowledged?: unknown }>(req, '{}');
  const id = str(b.id, 'id');
  if (path === '/guides/approve') {
    const r = approveGuide({ root: ctx.root, id, by: TRAIL_LEAD, sha256: str(b.sha256, 'sha256') });
    journalGuide(ctx.root, { action: 'approved', guide: id, version: r.guide.version });
  } else if (path === '/guides/checks/approve') {
    const acknowledged = b.acknowledged === true;
    const r = approveCheck({ root: ctx.root, id, name: str(b.name, 'name'), acknowledged });
    journalGuide(ctx.root, { action: 'check-approved', guide: id, version: r.version, check: r.check });
  } else {
    removeGuide({ root: ctx.root, id });
    journalGuide(ctx.root, { action: 'removed', guide: id });
  }
}

/**
 * `/guides`, the trail lead's side of guides (agents only read them, over MCP). GET `/guides` lists them; POST
 * `/guides/approve { id, sha256 }`, `/guides/checks/approve { id, name, acknowledged? }` (a program Teamtrail doesn't know needs `acknowledged`) and `/guides/remove { id }` act on the project;
 * POST `/guides/ticket { mapId, ticketId, add|remove }` and `/guides/trail { mapId, byType|null }` on a trail
 * (guideTrailActions.ts). GET
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
    else if (p === '/guides/ticket' || p === '/guides/trail') await guideTrailAction(ctx, req, p);
    else return false;
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    return (sendJson(res, 409, { error: e.message }), true);
  }
  sendJson(res, 200, guidesView(ctx.root));
  return true;
}
