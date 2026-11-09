import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LinearLookupRequest } from '../adapters/remote/types';
import { BadRequest, readJson, sendJson } from './http';
import type { LinearLookups } from './linearLookups';

export const LINEAR_TEAMS = '/trackers/linear/teams';
export const LINEAR_PROJECTS = '/trackers/linear/projects';

/** GET uses the found key; POST may carry a key pasted in the page (`{ apiKey }`), which is never echoed back. */
async function lookupRequest(req: IncomingMessage, url: URL): Promise<LinearLookupRequest> {
  if (req.method === 'POST') return readJson<LinearLookupRequest>(req, '{}');
  return { teamId: url.searchParams.get('team') ?? undefined };
}

/**
 * Read-only Linear lookups for the pickers:
 *   GET|POST /trackers/linear/teams                LinearTeamList: the teams the key can access, and who it is
 *   GET|POST /trackers/linear/projects?team=<id>   LinearProjectList: the projects of that team
 * Cached briefly per key; the key itself never leaves the process.
 */
export async function handleLinearTeams(
  req: IncomingMessage,
  res: ServerResponse,
  o: { url: URL; lookups: LinearLookups },
): Promise<boolean> {
  const p = o.url.pathname;
  if (p !== LINEAR_TEAMS && p !== LINEAR_PROJECTS) return false;
  if (req.method !== 'GET' && req.method !== 'POST') return (sendJson(res, 405, { error: 'method not allowed' }), true);
  const body = await lookupRequest(req, o.url);
  if (p === LINEAR_TEAMS) return (sendJson(res, 200, await o.lookups.teams(body)), true);
  const teamId = body.teamId?.trim();
  if (!teamId) throw new BadRequest('"team" is required');
  sendJson(res, 200, await o.lookups.projects({ ...body, teamId }));
  return true;
}
