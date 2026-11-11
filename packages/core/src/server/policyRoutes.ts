import type { IncomingMessage, ServerResponse } from 'node:http';
import { parsePolicy } from '../policy/policyFile';
import { approvePolicyHere, readPolicy, writePolicy } from '../policy/policyStore';
import { readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

/**
 * `/policy`: the project's risk policy (`policy.json` under `root`); false when the path doesn't match.
 * GET returns `{ policy, errors, defaults }`. PUT takes a whole policy from the trail lead, validates it like the file,
 * and answers 400 with every error, or 200 with the saved policy.
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
