import type { ServerResponse } from 'node:http';
import { contentHash } from '../lib/contentHash';
import { BadRequest, sendJson } from './http';

/**
 * Binds a trail lead's confirm or accept to what the Lookout showed them. GET routes hand out `contentHash` of what
 * they return; the POST sends it back. Missing: 400. Different from the content now (an agent rewrote it while the
 * human read): 409, and nothing is written. Returns true when the request may go on.
 */
export function matchesShown(res: ServerResponse, at: { given: unknown; now: unknown; what: string }) {
  if (typeof at.given !== 'string' || !at.given)
    throw new BadRequest('"hash" of what you were shown is required: reload and review it');
  if (at.given === contentHash(at.now)) return true;
  sendJson(res, 409, { error: `${at.what} changed since you opened it: review it again before you approve it.` });
  return false;
}
