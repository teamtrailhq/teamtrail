import type { IncomingMessage, ServerResponse } from 'node:http';
import { readAttentionPrefs, updateAttentionState, writeAttentionPrefs } from '../attention/attentionStore';
import { attentionView } from '../attention/attentionView';
import type { AttentionState, AttentionView } from '../model/attention';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

const MAX_SNOOZE_MS = 7 * 24 * 3_600_000;

function itemId(body: { id?: unknown }): string {
  if (typeof body.id !== 'string' || !body.id) throw new BadRequest('"id" (an attention item id) is required');
  return body.id;
}

/** How long a snooze lasts: `minutes` from now, or until `until`; at most a week. */
function snoozeUntil(body: { minutes?: unknown; until?: unknown }, now: number): number {
  if (typeof body.until === 'number') return Math.min(body.until, now + MAX_SNOOZE_MS);
  if (typeof body.minutes === 'number' && body.minutes > 0) return now + Math.min(body.minutes * 60_000, MAX_SNOOZE_MS);
  throw new BadRequest('"minutes" (more than 0) or "until" (epoch ms) is required');
}

/**
 * `/attention` routes: the ranked queue (GET), snooze, dismiss and restore (POST), and this person's
 * prefs (GET and PUT `/attention/prefs`, kept in `configDir`). False when none matches.
 */
export async function handleAttention(
  { root, active, configDir, served }: RouteContext & { configDir?: string; served?: (view: AttentionView) => void },
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith('/attention')) return false;
  const now = Date.now();
  if (p === '/attention' && req.method === 'GET') {
    const view = await attentionView({ root, adapter: await active(), configDir, now });
    served?.(view);
    sendJson(res, 200, view);
    return true;
  }
  if (p === '/attention/prefs' && req.method === 'GET') {
    sendJson(res, 200, readAttentionPrefs(configDir));
    return true;
  }
  if (p === '/attention/prefs' && req.method === 'PUT') {
    const parsed = writeAttentionPrefs(await readJson<unknown>(req), configDir);
    sendJson(res, parsed.errors.length ? 400 : 200, parsed.errors.length ? { errors: parsed.errors } : parsed.value);
    return true;
  }
  if (req.method !== 'POST') return false;
  const body = await readJson<{ id?: unknown; minutes?: unknown; until?: unknown }>(req, '{}');
  if (p === '/attention/snooze') {
    const id = itemId(body);
    const until = snoozeUntil(body, now);
    sendJson(
      res,
      200,
      updateAttentionState(root, (s) => ({ ...s, snoozed: { ...s.snoozed, [id]: until } }), now),
    );
    return true;
  }
  if (p === '/attention/dismiss') {
    const id = itemId(body);
    sendJson(
      res,
      200,
      updateAttentionState(root, (s) => ({ ...s, dismissed: [...new Set([...s.dismissed, id])] }), now),
    );
    return true;
  }
  if (p === '/attention/restore') {
    const id = itemId(body);
    const restore = (s: AttentionState): AttentionState => ({
      ...s,
      snoozed: Object.fromEntries(Object.entries(s.snoozed).filter(([k]) => k !== id)),
      dismissed: s.dismissed.filter((d) => d !== id),
    });
    sendJson(res, 200, updateAttentionState(root, restore, now));
    return true;
  }
  return false;
}
