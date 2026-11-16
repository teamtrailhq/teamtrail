import type { IncomingMessage, ServerResponse } from 'node:http';
import { OperationError } from '../planning/operations/operationError';
import { checksApproval } from '../verification/checksApproval';
import { readVerificationConfig, VERIFICATION_FILE } from '../verification/configFile';
import { setChecks, StaleChecks } from '../verification/setChecks';
import { BadRequest, readJson, sendJson } from './http';
import { personOfRequest } from './requestPerson';
import { ELSEWHERE } from './thisMachineRoutes';
import { crossSite } from './trackerErrors';

/**
 * `PUT /verification/config` `{checks: [{name, run}], base, acknowledged?}`: the trail lead sets the check commands
 * and approves them in one step (verification/setChecks.ts). This machine only (thisMachineRoutes.ts), never cross-site;
 * who did it is the sign-in's person (requestPerson.ts), never the body's. 409 when the file changed since `base`.
 */
async function putChecks(o: { root: string; local?: boolean }, req: IncomingMessage, res: ServerResponse) {
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  if (o.local === false) return (sendJson(res, 403, { error: ELSEWHERE, elsewhere: true }), true);
  const b = await readJson<{ checks?: unknown; base?: unknown; acknowledged?: unknown }>(req, '{}');
  if (!Array.isArray(b.checks) || typeof b.base !== 'string') throw new BadRequest('"checks" and "base" are required');
  const checks = b.checks.map((c) => ({
    name: String((c as { name?: unknown })?.name ?? ''),
    run: (c as { run?: unknown })?.run as string[],
  }));
  try {
    const by = personOfRequest(req)?.name ?? 'trail lead';
    const approval = setChecks({ root: o.root, checks, base: b.base, acknowledged: b.acknowledged === true, by });
    sendJson(res, 200, { approval: { state: approval.state, waiting: approval.waiting }, hash: approval.hash });
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    sendJson(res, e instanceof StaleChecks ? 409 : 400, { error: e.message });
  }
  return true;
}

/**
 * `/verification/config`: GET the parsed file, whether its commands are approved on this machine and the `base` a
 * change must name; PUT to set the checks (putChecks).
 */
export async function handleChecksConfig(
  o: { root: string; local?: boolean },
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method === 'PUT') return putChecks(o, req, res);
  if (req.method !== 'GET') return false;
  const { exists, errors, hash, config } = readVerificationConfig(o.root);
  // Whether its commands run on this machine yet: only once the trail lead approved this exact file here. `base`:
  // what a change from the Lookout must name, the file as this read saw it (setChecks.ts).
  const { state, waiting, hash: base } = checksApproval(o.root);
  sendJson(res, 200, { file: VERIFICATION_FILE, exists, errors, hash, config, approval: { state, waiting, base } });
  return true;
}
