import type { IncomingMessage, ServerResponse } from 'node:http';
import { OperationError } from '../planning/operations/operationError';
import { heldRulesStore } from '../verification/heldRulesStore';
import { rulesLastMatched } from '../verification/rulesLastMatched';
import { ruleWaivers } from '../verification/ruleWaivers';
import { StaleChecks } from '../verification/setChecks';
import { setRules } from '../verification/setRules';
import { waiveRule } from '../verification/waiveRule';
import { BadRequest, readJson, sendJson } from './http';
import { lookoutVia } from './lookoutVia';
import { personOfRequest } from './requestPerson';
import type { RouteContext } from './routeContext';
import { ELSEWHERE } from './thisMachineRoutes';
import { crossSite } from './trackerErrors';

type Ctx = Pick<RouteContext, 'root' | 'active'> & { local?: boolean };
const str = (v: unknown, max = 200) => (typeof v === 'string' && v && v.length <= max ? v : undefined);

/** `PUT /verification/rules` `{rules, base}`: set and approved in one step (setRules.ts); this machine only. */
async function putRules(o: Ctx, req: IncomingMessage, res: ServerResponse) {
  if (o.local === false) return sendJson(res, 403, { error: ELSEWHERE, elsewhere: true });
  const b = await readJson<{ rules?: unknown; base?: unknown }>(req, '{}');
  if (typeof b.base !== 'string') throw new BadRequest('"rules" and "base" are required');
  try {
    const by = personOfRequest(req)?.name ?? 'trail lead';
    const approval = setRules({ root: o.root, rules: b.rules, base: b.base, by });
    sendJson(res, 200, { approval: { state: approval.state, waiting: approval.waiting }, hash: approval.hash });
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    sendJson(res, e instanceof StaleChecks ? 409 : 400, { error: e.message });
  }
}

/** `POST /verification/rules/waive` `{mapId, ticketId, rule, reason}`: Go without a rule for one ticket. */
async function waive(o: Ctx, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<Record<string, unknown>>(req, '{}');
  const [mapId, ticketId, rule] = [str(b.mapId), str(b.ticketId), str(b.rule, 20)];
  const reason = typeof b.reason === 'string' ? b.reason : '';
  if (!mapId || !ticketId || !rule) throw new BadRequest('"mapId", "ticketId" and "rule" are required');
  const who = { person: personOfRequest(req)?.name, via: lookoutVia(req), local: o.local !== false };
  try {
    const env = { adapter: await o.active(), root: o.root };
    sendJson(res, 200, await waiveRule(env, { mapId, ticketId, rule, reason, ...who }));
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    sendJson(res, 409, { error: e.message });
  }
}

/**
 * Diff rules (model/diffRule.ts):
 *   GET  /verification/rules                          `{ lastMatched }`: when each rule last matched a completion
 *   PUT  /verification/rules                          `{rules, base}`: the trail lead sets them, approved in the same
 *                                                     step; this machine only (thisMachineRoutes.ts)
 *   GET  /verification/rules/held?mapId=&ticketId=    `{ held?, waived }`: the rules a completion was refused for
 *   POST /verification/rules/waive                    `{mapId, ticketId, rule, reason}` → `{ rule, waived }`
 * Writes are never cross-site; who did it is the sign-in's person and how the route's (lookoutVia.ts), never the body's.
 */
export async function handleRules(o: Ctx, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  const q = (k: string) => url.searchParams.get(k) ?? '';
  if (p === '/verification/rules' && req.method === 'GET')
    return (sendJson(res, 200, { lastMatched: rulesLastMatched(o.root) }), true);
  if (p === '/verification/rules/held' && req.method === 'GET') {
    if (!q('mapId') || !q('ticketId')) throw new BadRequest('"mapId" and "ticketId" are required');
    const held = heldRulesStore.read(o.root, q('mapId'), q('ticketId'));
    const waived = ruleWaivers
      .list(o.root, q('mapId'), q('ticketId'))
      .map((w) => ({ rule: w.rule, by: w.by, at: w.at }));
    return (sendJson(res, 200, { ...(held ? { held } : {}), waived }), true);
  }
  const write =
    (p === '/verification/rules' && req.method === 'PUT') ||
    (p === '/verification/rules/waive' && req.method === 'POST');
  if (!write) return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  await (req.method === 'PUT' ? putRules(o, req, res) : waive(o, req, res));
  return true;
}
