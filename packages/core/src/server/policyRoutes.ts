import type { IncomingMessage, ServerResponse } from 'node:http';
import { parsePolicy } from '../policy/policyFile';
import { approvePolicyHere, readPolicy, writePolicy } from '../policy/policyStore';
import { readJson, sendJson } from './http';
import { markedLimited } from './limitedRequests';
import type { RouteContext } from './routeContext';

const LIMITED = 'The risk policy says what is high risk: ask someone allowed to make high-risk calls to change it.';

/**
 * `/policy`: the project's risk policy (`policy.json` under `root`); false when the path doesn't match.
 * GET returns `{ policy, errors, defaults }`. PUT takes a whole policy from the trail lead, validates it like the file,
 * and answers 400 with every error, or 200 with the saved policy; 403 to a caller not allowed high-risk calls.
 */
export async function handlePolicy(
  ctx: Pick<RouteContext, 'root'>,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (url.pathname !== '/policy') return false;
  if (req.method === 'GET') {
    sendJson(res, 200, readPolicy(ctx.root));
    return true;
  }
  if (req.method === 'PUT') {
    // What is high risk is not for a caller who may not make high-risk calls to change (limitedRequests.ts).
    if (markedLimited(req)) return (sendJson(res, 403, { error: LIMITED, highRisk: true }), true);
    const body = await readJson<unknown>(req, '{}');
    const { policy, errors } = parsePolicy(JSON.stringify(body));
    if (!policy) return (sendJson(res, 400, { error: errors.join('; '), errors }), true);
    writePolicy(ctx.root, policy);
    // Saved by the trail lead on this machine (the route answers nowhere else): what it lowers is approved.
    approvePolicyHere(ctx.root, 'trail lead', policy);
    sendJson(res, 200, readPolicy(ctx.root));
    return true;
  }
  return false;
}
