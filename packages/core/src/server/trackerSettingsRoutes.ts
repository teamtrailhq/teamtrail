import type { IncomingMessage, ServerResponse } from 'node:http';
import { confirmTrackerSettings, type SettingsChoice } from '../planning/lifecycle/confirmTrackerSettings';
import { OperationError } from '../planning/operations/operationError';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

export const CONFIRM_TRACKER_SETTINGS = '/trackers/settings/confirm';
const CHOICES: SettingsChoice[] = ['as-is', 'stricter'];

/**
 * `POST /trackers/settings/confirm` `{ mapId, issueId, choice }`: the trail lead settles settings someone else
 * wrote into a GitHub or Linear issue (confirmTrackerSettings.ts). Under `/trackers/`, so this machine's alone
 * (thisMachineRoutes.ts). False when the path doesn't match.
 */
export async function handleTrackerSettings(
  { root, active }: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname !== CONFIRM_TRACKER_SETTINGS || req.method !== 'POST') return false;
  const b = await readJson<{ mapId?: unknown; issueId?: unknown; choice?: unknown }>(req, '{}');
  const choice = CHOICES.find((c) => c === b.choice);
  if (typeof b.mapId !== 'string' || typeof b.issueId !== 'string' || !choice)
    throw new BadRequest('"mapId", "issueId" and "choice" (as-is or stricter) are required');
  try {
    await confirmTrackerSettings(await active(), { root, mapId: b.mapId, issueId: b.issueId, choice });
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    return (sendJson(res, 409, { error: e.message }), true);
  }
  sendJson(res, 200, { ok: true });
  return true;
}
