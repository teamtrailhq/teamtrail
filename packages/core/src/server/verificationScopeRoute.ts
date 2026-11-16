import type { IncomingMessage, ServerResponse } from 'node:http';
import { OperationError } from '../planning/operations/operationError';
import { StaleChecks } from '../verification/setChecks';
import { setScope } from '../verification/setScope';
import { BadRequest, readJson, sendJson } from './http';
import { personOfRequest } from './requestPerson';
import { ELSEWHERE } from './thisMachineRoutes';
import { crossSite } from './trackerErrors';

/**
 * `PUT /verification/scope` `{scope, base}`: the trail lead sets what a change outside the files an agent declared
 * does (flag, fail or human) and approves verification.json in the same step (verification/setScope.ts). This machine
 * only, never cross-site; who did it is the sign-in's person, never the body's. 409 when the file changed since `base`.
 */
export async function putScope(o: { root: string; local?: boolean }, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'PUT') return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  if (o.local === false) return (sendJson(res, 403, { error: ELSEWHERE, elsewhere: true }), true);
  const b = await readJson<{ scope?: unknown; base?: unknown }>(req, '{}');
  if (typeof b.base !== 'string') throw new BadRequest('"scope" and "base" are required');
  try {
    const by = personOfRequest(req)?.name ?? 'trail lead';
    const approval = setScope({ root: o.root, scope: b.scope, base: b.base, by });
    sendJson(res, 200, { approval: { state: approval.state, waiting: approval.waiting }, hash: approval.hash });
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    sendJson(res, e instanceof StaleChecks ? 409 : 400, { error: e.message });
  }
  return true;
}
