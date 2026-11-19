import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { outboxDir } from '../adapters/remote/outboxFile';
import { refusedGroups } from '../adapters/remote/refusedGroups';
import { refusedWrites } from '../adapters/remote/refusedWrites';
import type { RefusedWrite } from '../adapters/remote/sync/types';
import { journalFile } from '../history/journalFile';
import { writePrivateFile } from '../machine/writePrivateFile';
import { TRUST_JOURNAL } from '../model/lifecycle';
import { BadRequest, readJson, sendJson } from './http';

export const REFUSED_WRITES = '/trackers/refused';

const TRACKER = { github: 'GitHub', linear: 'Linear' } as const;

const CHANGED = 'These writes changed since you looked: retried, discarded or refused again. Look again.';
const OTHER_TARGET = 'These writes were for another tracker than the one connected now, so they can only be discarded.';

/** Puts the writes back at the end of their tracker's queue on this machine, where the adapter sends them. */
function requeue(o: { root: string; configDir: string; key: string; writes: RefusedWrite[] }) {
  const now = Date.now();
  const writes = o.writes.map((r, i) => ({ ...r.write, at: now + i }));
  const file = path.join(outboxDir(o.root, o.configDir), `${o.key}.retry-${now}.json`);
  writePrivateFile(file, JSON.stringify({ v: 1, writes }));
}

function journal(root: string, input: { action: 'retry' | 'discard'; writes: RefusedWrite[] }) {
  const { writes } = input;
  const labels = writes.map((r) => r.write.label).join(', ');
  journalFile(root).append({
    v: 1,
    kind: 'trust',
    at: Date.now(),
    mapId: TRUST_JOURNAL,
    action: input.action === 'retry' ? 'write-retried' : 'write-discarded',
    subject: `${TRACKER[writes[0].tracker]} refused ${labels} on trail ${writes[0].write.mapId}: ${input.action}`,
    detail: writes.map((r) => r.error).join(' · '),
    actor: 'trail lead',
    actorKind: 'trail lead',
  });
}

/**
 * POST `/trackers/refused` `{ action: 'retry' | 'discard', mapId, ref }`: the trail lead's answer to a
 * `tracker-refused` attention item (its `mapId` and `ref`, so a set that changed since it was shown is refused with
 * a 409). Retry puts the writes back in this machine's queue for the tracker connected now, which sends them again;
 * Discard forgets them. Journaled under `_trust`. This machine only (under `/trackers/`, thisMachineRoutes.ts):
 * Retry sends with this machine's token.
 */
export async function handleRefusedWrites(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { root: string; configDir: string; currentKey: () => string | undefined; requeued: () => void },
): Promise<boolean> {
  if (req.method !== 'POST') return false;
  const b = await readJson<{ action?: unknown; mapId?: unknown; ref?: unknown }>(req, '{}');
  if (b.action !== 'retry' && b.action !== 'discard') throw new BadRequest('"action" must be retry or discard');
  const store = refusedWrites(ctx.root, ctx.configDir);
  const group = refusedGroups(store.list()).find((g) => g.mapId === b.mapId && g.ref === b.ref);
  if (!group) return (sendJson(res, 409, { error: CHANGED }), true);
  const retryKey = b.action === 'retry' ? ctx.currentKey() : undefined;
  if (b.action === 'retry' && (!retryKey || group.writes.some((r) => r.key !== retryKey)))
    return (sendJson(res, 409, { error: OTHER_TARGET }), true);
  const writes = store.take(group.writes.map((r) => r.write.id));
  if (!writes.length) return (sendJson(res, 409, { error: CHANGED }), true);
  if (retryKey) requeue({ root: ctx.root, configDir: ctx.configDir, key: retryKey, writes });
  journal(ctx.root, { action: b.action, writes });
  if (retryKey) ctx.requeued();
  sendJson(res, 200, { [b.action === 'retry' ? 'retried' : 'discarded']: writes.length });
  return true;
}
