import type { SlackConfig } from '../store';
import { SLACK_NOTIFY_EVENTS, type SlackSettingsPatch, type SlackUser } from '../types';
import { statusOf } from './setupStatus';
import { journalSlack } from './slackJournal';
import type { SlackContext } from './slackContext';
import type { Payload } from './types';

export function markCreated(ctx: SlackContext) {
  ctx.store.update({ created: true });
  return statusOf(ctx);
}

export function updateSettings(ctx: SlackContext, patch: SlackSettingsPatch) {
  const c = ctx.store.read();
  const next: Partial<SlackConfig> = {};
  if (patch.allow)
    next.allow = patch.allow.filter((u) => /^[UW][A-Z0-9]+$/.test(u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (patch.notify) {
    const n = { ...c.notify, ...patch.notify };
    if (n.target !== 'dm' && !/^[CG][A-Z0-9]+$/.test(n.target)) n.target = c.notify.target;
    n.events = n.events.filter((e) => SLACK_NOTIFY_EVENTS.includes(e));
    if (n.detail !== 'titles-only') n.detail = 'full';
    next.notify = n;
  }
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  ctx.store.update(next);
  if (next.allow) journalAllow(ctx, c.allow, next.allow);
  if (patch.enabled === true) ctx.start();
  if (patch.enabled === false) ctx.stop();
  return statusOf(ctx);
}

/** Members the trail lead allowed or stopped allowing: each one a line in the history. */
function journalAllow(ctx: SlackContext, before: SlackUser[], after: SlackUser[]) {
  const had = new Set(before.map((u) => u.id));
  const has = new Set(after.map((u) => u.id));
  for (const u of after) if (!had.has(u.id)) journalSlack(ctx, { action: 'allow-added', who: u, by: 'lead' });
  for (const u of before) if (!has.has(u.id)) journalSlack(ctx, { action: 'allow-removed', who: u, by: 'lead' });
}

export function remove(ctx: SlackContext) {
  journalSlack(ctx, { action: 'removed', by: 'lead' });
  ctx.stop();
  ctx.store.clear();
  ctx.dms.clear();
  ctx.ownerCode = undefined;
  ctx.ownerCodeDropped = undefined;
  ctx.state = 'off';
  ctx.error = undefined;
  return statusOf(ctx);
}

export async function members(ctx: SlackContext): Promise<SlackUser[]> {
  if (!ctx.bot) return [];
  const r = await ctx.call<{ members: Payload[] }>('users.list', { limit: 200 });
  return r.members
    .filter((m) => !m.deleted && !m.is_bot && m.id !== 'USLACKBOT')
    .map((m) => ({ id: m.id as string, name: (m.profile?.display_name || m.real_name || m.name) as string }));
}
