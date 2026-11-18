import type { IncomingMessage, ServerResponse } from 'node:http';
import { OperationError } from '../planning/operations/operationError';
import { readGateLog } from '../verification/readGateLog';
import { StaleChecks } from '../verification/setChecks';
import { setGateMode } from '../verification/setGateMode';
import { BadRequest, readJson, sendJson } from './http';
import { personOfRequest } from './requestPerson';
import type { RouteContext } from './routeContext';
import { ELSEWHERE } from './thisMachineRoutes';
import { crossSite } from './trackerErrors';

/**
 * `GET /verification/gates`: what the verification gates held back or would have, every trail, the last two weeks
 * (verification/readGateLog.ts). Anyone signed in reads it.
 *
 * `PUT /verification/gates` `{gate, mode, base}`: the trail lead sets one gate off, observe or enforce and approves
 * verification.json in the same step (verification/setGateMode.ts). This machine only, never cross-site; who did it
 * is the sign-in's person, never the body's. 409 when the file changed since `base`.
 */
export async function handleGates(
  o: Pick<RouteContext, 'root' | 'active'> & { local?: boolean },
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method === 'GET') {
    const maps = await (await o.active()).listMaps();
    sendJson(res, 200, readGateLog({ root: o.root, mapIds: maps.map((m) => m.id) }));
    return true;
  }
  if (req.method !== 'PUT') return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  if (o.local === false) return (sendJson(res, 403, { error: ELSEWHERE, elsewhere: true }), true);
  const b = await readJson<{ gate?: unknown; mode?: unknown; base?: unknown }>(req, '{}');
  if (typeof b.base !== 'string') throw new BadRequest('"gate", "mode" and "base" are required');
  try {
    const by = personOfRequest(req)?.name ?? 'trail lead';
    const approval = setGateMode({ root: o.root, gate: b.gate, mode: b.mode, base: b.base, by });
    sendJson(res, 200, { approval: { state: approval.state, waiting: approval.waiting }, hash: approval.hash });
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    sendJson(res, e instanceof StaleChecks ? 409 : 400, { error: e.message });
  }
  return true;
}
