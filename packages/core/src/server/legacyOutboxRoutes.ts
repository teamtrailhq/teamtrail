import type { IncomingMessage, ServerResponse } from 'node:http';
import { legacyOutbox } from '../adapters/remote/legacyOutbox';
import { outboxDir } from '../adapters/remote/outboxFile';
import { journalFile } from '../history/journalFile';
import { TRUST_JOURNAL } from '../model/lifecycle';
import { BadRequest, readJson, sendJson } from './http';

export const LEGACY_OUTBOX = '/trackers/legacy-outbox';

/**
 * GET `/trackers/legacy-outbox`: the writes an earlier version queued in the repo (`{ writes, targets, labels }`).
 * POST `{ action: 'send' | 'discard', writes }`: the trail lead sends them (into this machine's queue, then the
 * adapter picks them up) or discards them. `writes` is the count the page showed; a queue that changed since is
 * refused. This machine only (under `/trackers`), journaled.
 */
export async function handleLegacyOutbox(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { root: string; configDir: string; adopt: () => void },
): Promise<boolean> {
  const queue = legacyOutbox(ctx.root);
  if (req.method === 'GET') return (sendJson(res, 200, queue.list()), true);
  if (req.method !== 'POST') return false;
  const b = await readJson<{ action?: unknown; writes?: unknown }>(req, '{}');
  if (b.action !== 'send' && b.action !== 'discard') throw new BadRequest('"action" must be send or discard');
  const shown = queue.list();
  if (b.writes !== shown.writes)
    return (sendJson(res, 409, { error: 'The old queue changed since you looked at it. Look again.' }), true);
  if (b.action === 'send') queue.send(outboxDir(ctx.root, ctx.configDir));
  else queue.discard();
  journalFile(ctx.root).append({
    v: 1,
    kind: 'trust',
    at: Date.now(),
    mapId: TRUST_JOURNAL,
    action: b.action === 'send' ? 'approved' : 'tracker-kept',
    subject: `${shown.writes} tracker writes queued before the upgrade (${shown.targets.join(', ')}): ${b.action}`,
    actor: 'trail lead',
    actorKind: 'trail lead',
  });
  if (b.action === 'send') ctx.adopt();
  sendJson(res, 200, queue.list());
  return true;
}
