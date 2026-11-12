import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import { botApi } from '../slack/botApi';
import type { Link } from '../types';

type MembersContext = Pick<ServiceContext, 'store' | 'cipher' | 'config' | 'fetch' | 'now' | 'members'>;

interface MembersPage {
  members?: string[];
  response_metadata?: { next_cursor?: string };
}

async function lookUp(ctx: MembersContext, link: Link, channel: string) {
  const api = await botApi(ctx, link.teamId);
  if (!api) return false;
  let cursor: string | undefined;
  for (let page = 0; page < LIMITS.memberPages; page++) {
    const r = await api.call<MembersPage>('conversations.members', { channel, limit: 1000, cursor });
    if (r.members?.includes(link.userId)) return true;
    cursor = r.response_metadata?.next_cursor || undefined;
    if (!cursor) return false;
  }
  return false;
}

/**
 * Whether the link's owner is a member of this channel, so the link may post there. Asked of Slack
 * (`conversations.members`) and cached for a couple of minutes; any error counts as no.
 */
export async function ownerInChannel(ctx: MembersContext, link: Link, channel: string) {
  const key = `${link.teamId}:${channel}:${link.userId}`;
  const cached = ctx.members.get(key);
  if (cached && cached.until > ctx.now()) return cached.ok;
  const ok = await lookUp(ctx, link, channel).catch(() => false);
  ctx.members.set(key, { ok, until: ctx.now() + LIMITS.memberCacheMs });
  if (ctx.members.size > 10_000) ctx.members.delete(ctx.members.keys().next().value as string);
  return ok;
}
