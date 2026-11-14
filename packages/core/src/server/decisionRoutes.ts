import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import type { DecisionInput } from '../model/types';
import { DECISION_SOURCES } from '../planning/decisions/decisionRecord';
import { recordDecision, supersedeDecision } from '../planning/operations/decisionOps';
import type { LookoutGuard } from '../planning/operations/lookoutGuard';
import { ticketNeedsLookout } from '../policy/ticketNeedsLookout';
import { BadRequest, readJson, sendJson } from './http';
import { lookoutVia } from './lookoutVia';

async function trailOf(adapter: TrackerAdapter, b: { trail?: unknown }) {
  const id = typeof b.trail === 'string' ? b.trail : '';
  if (!(await adapter.listMaps()).some((m) => m.id === id)) throw new BadRequest(`unknown trail "${id}"`);
  return id;
}

function checkInput(b: Partial<DecisionInput>, needQuestion: boolean) {
  const required: ('question' | 'answer' | 'decidedBy')[] = [
    ...(needQuestion ? (['question'] as const) : []),
    'answer',
    'decidedBy',
  ];
  for (const k of required) if (typeof b[k] !== 'string' || !b[k]!.trim()) throw new BadRequest(`"${k}" is required`);
  if (!b.source || !(b.source.kind in DECISION_SOURCES))
    throw new BadRequest(`"source.kind" must be one of ${Object.keys(DECISION_SOURCES).join(', ')}`);
}

/**
 * How a decision recorded through this request is guarded: given in the Lookout, by a caller allowed high-risk calls
 * or not (lookoutVia.ts), and this machine's check of whether its ticket is high risk.
 */
const guardOf = (root: string, req: IncomingMessage): LookoutGuard => ({
  via: lookoutVia(req),
  highRisk: (mapId, ticketId) => ticketNeedsLookout(root, mapId, ticketId),
});

/** `/decisions` routes on the given tracker (`root`: its folder); false when none matches. */
export async function handleDecisions(
  { adapter, root }: { adapter: TrackerAdapter; root: string },
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === '/decisions' && req.method === 'GET') {
    const only = url.searchParams.get('trail');
    const ids = only ? [only] : (await adapter.listMaps()).map((m) => m.id);
    const decisions = (await Promise.all(ids.map((id) => adapter.listDecisions(id))))
      .flat()
      .sort((a, b) => b.decidedAt - a.decidedAt);
    sendJson(res, 200, { decisions });
    return true;
  }
  if (url.pathname === '/decisions' && req.method === 'POST') {
    const b = await readJson<Partial<DecisionInput> & { trail?: string; appendToTrail?: boolean }>(req);
    const mapId = await trailOf(adapter, b);
    checkInput(b, true);
    const { trail: _m, appendToTrail, ...input } = b;
    const guard = guardOf(root, req);
    sendJson(res, 201, await recordDecision(adapter, mapId, input as DecisionInput, { appendToTrail, guard }));
    return true;
  }
  const sup = url.pathname.match(/^\/decisions\/([^/]+)\/supersede$/);
  if (sup && req.method === 'POST') {
    const b = await readJson<Partial<DecisionInput> & { trail?: string }>(req);
    const mapId = await trailOf(adapter, b);
    checkInput(b, false);
    const { trail: _m, ...input } = b;
    const id = decodeURIComponent(sup[1]);
    const guard = guardOf(root, req);
    sendJson(res, 201, await supersedeDecision(adapter, mapId, id, { ...(input as DecisionInput), guard }));
    return true;
  }
  return false;
}
