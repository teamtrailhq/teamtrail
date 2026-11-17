import type { IncomingMessage, ServerResponse } from 'node:http';
import { chooseMain } from '../mainChecks/chooseMain';
import { mainChecksPlan } from '../mainChecks/mainChecksPlan';
import { latestMainRun } from '../mainChecks/mainRunStore';
import { readMainChecks } from '../mainChecks/readMainChecks';
import { requestMainRun } from '../mainChecks/requestMainRun';
import type { MainRunEnv } from '../mainChecks/startMainRun';
import type { MainChoice } from '../model/mainChecks';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';
import { crossSite } from './trackerErrors';

const SIMPLE = new Set(['fix-main', 'proceed', 'undo-fix-main', 'undo-proceed']);
const WITH_CHECK = new Set(['drop', 'restore']);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function choiceOf(v: unknown): MainChoice {
  const c = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const kind = str(c.kind) ?? '';
  if (SIMPLE.has(kind)) return { kind } as MainChoice;
  const check = str(c.check);
  if (WITH_CHECK.has(kind) && check) return { kind, check } as MainChoice;
  throw new BadRequest('"choice" must be a known choice; drop and restore name a "check"');
}

export interface MainChecksRouteContext extends RouteContext {
  env: MainRunEnv;
  /** Tells open Lookouts to load checks on main again. */
  changed: () => void;
}

/**
 * Checks on main (mainChecks/):
 *   GET  /main-checks?mapId=        MainChecksView for the trail; without mapId `{ run, off? }` for the project
 *   POST /main-checks/run           `{ mapId? }`: the trail lead's "Run checks on main", journaled → `{ run }`
 *   POST /main-checks/choose        `{ mapId, choice: MainChoice }`: Fix main first, Drop a check for this trail, Start
 *                                   anyway, or an undo; on this machine, journaled → MainChecksView
 * A run uses only the approved check commands; the bridge's runner runs it when the server has one (Cloud).
 */
export async function handleMainChecks(
  ctx: MainChecksRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith('/main-checks')) return false;
  if (p === '/main-checks' && req.method === 'GET') {
    const mapId = url.searchParams.get('mapId');
    if (mapId) return (sendJson(res, 200, await readMainChecks(ctx.env, mapId)), true);
    // project-wide (Settings → Verification): the latest run, or why none can run
    const plan = mainChecksPlan(ctx.root);
    const off = plan.kind === 'off' ? { off: plan.reason } : {};
    const run = latestMainRun(ctx.root, plan.kind === 'run' ? plan.budgetMs : 0);
    return (sendJson(res, 200, { run: run ?? null, ...off }), true);
  }
  if (req.method !== 'POST') return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  const body = await readJson<Record<string, unknown>>(req, '{}');
  if (p === '/main-checks/run') {
    const start = requestMainRun(ctx.env, { mapId: str(body.mapId) });
    ctx.changed();
    if (start.kind === 'off') return (sendJson(res, 409, { error: start.reason }), true);
    return (sendJson(res, 200, { run: start.run ?? null }), true);
  }
  if (p === '/main-checks/choose') {
    const mapId = str(body.mapId);
    if (!mapId) throw new BadRequest('"mapId" is required');
    chooseMain({ root: ctx.root, mapId, choice: choiceOf(body.choice) });
    ctx.changed();
    return (sendJson(res, 200, await readMainChecks(ctx.env, mapId)), true);
  }
  return false;
}
