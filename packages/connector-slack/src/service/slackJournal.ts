import { BRAND, SLACK_JOURNAL, type SlackOwnerAction } from '@teamtrail/core';
import { journalFile } from '@teamtrail/core/agents';
import type { SlackUser } from '../types';
import type { SlackContext } from './slackContext';

const TRAIL_LEAD = 'trail lead';

/**
 * Changes to who Scout talks to and who may act in Slack, in the project's history: the owner put forward,
 * confirmed or reset, members allowed or no longer allowed, the app changed, Slack removed. `by` says whether the
 * trail lead did it on this machine or it came from Slack. Never a token or the code.
 */
export function journalSlack(
  ctx: SlackContext,
  e: { action: SlackOwnerAction; who?: SlackUser; by: 'slack' | 'lead' },
) {
  const { who, by } = e;
  try {
    journalFile(ctx.o.root).append({
      v: 1,
      kind: 'slack',
      at: ctx.o.now?.() ?? Date.now(),
      mapId: SLACK_JOURNAL,
      action: e.action,
      ...(who ? { user: who.id } : {}),
      ...(who?.name ? { name: who.name } : {}),
      ...(who?.via ? { via: who.via } : {}),
      actor: by === 'lead' ? TRAIL_LEAD : BRAND.slug,
      actorKind: by === 'lead' ? 'trail lead' : 'engine',
    });
  } catch {
    /* the history is a record, not a gate: a tracker folder that can't be written doesn't undo the change */
  }
}
