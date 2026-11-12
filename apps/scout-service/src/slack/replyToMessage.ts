import { AS_WRITTEN, SlackApiError } from '@teamtrail/connector-slack/api';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import { botApi } from './botApi';
import { offlineFailed } from './offlineFailed';

type Obj = Record<string, unknown>;
type Api = NonNullable<Awaited<ReturnType<typeof botApi>>>;

/** Slack's answers when Scout can't post in the mention's channel: it isn't a member there. */
const NOT_THERE = new Set(['not_in_channel', 'channel_not_found']);

/** Whether this person may be told again now: once a minute, so writing @Scout over and over gets one answer. */
function firstThisMinute(ctx: ServiceContext, key: string) {
  const now = ctx.now();
  const last = ctx.offlineSaid.get(key);
  if (last !== undefined && now - last < LIMITS.offlineReplyMs) return false;
  ctx.offlineSaid.set(key, now);
  if (ctx.offlineSaid.size > LIMITS.recentEvents) ctx.offlineSaid.delete(ctx.offlineSaid.keys().next().value as string);
  return true;
}

/** The service's own reply in the person's DM with Scout, when it couldn't answer where they wrote. */
async function toTheirDm(ctx: ServiceContext, api: Api, o: { userId: string; text: string }) {
  try {
    const opened = await api.call<{ channel?: { id?: string } }>('conversations.open', { users: o.userId });
    const channel = opened.channel?.id;
    if (!channel?.startsWith('D')) return;
    await api.call('chat.postMessage', { channel, text: o.text, ...AS_WRITTEN });
  } catch (e) {
    offlineFailed(ctx, 'chat.postMessage', e);
  }
}

async function replyToMention(ctx: ServiceContext, api: Api, o: { userId: string; event: Obj; text: string }) {
  // Only in a thread the mention was already in: Slack never shows an ephemeral reply in a thread nobody can open.
  const thread = typeof o.event.thread_ts === 'string' ? { thread_ts: o.event.thread_ts } : {};
  const args = { channel: o.event.channel, user: o.userId, text: o.text, ...thread, ...AS_WRITTEN };
  try {
    await api.call('chat.postEphemeral', args);
  } catch (e) {
    offlineFailed(ctx, 'chat.postEphemeral', e);
    if (e instanceof SlackApiError && NOT_THERE.has(e.code)) await toTheirDm(ctx, api, o);
  }
}

/**
 * A mention or DM whose Teamtrail can't take it: answered where it was asked, the mention privately in its thread
 * (in the person's DM with Scout when Scout isn't in that channel), the DM in that DM. Once a minute per person.
 */
export async function replyToMessage(
  ctx: ServiceContext,
  o: { teamId: string; userId: string; event: Obj; text: string },
) {
  if (!firstThisMinute(ctx, `${o.teamId}:${o.userId}`)) return;
  const api = await botApi(ctx, o.teamId);
  if (!api || typeof o.event.channel !== 'string') return;
  if (o.event.type === 'app_mention') return replyToMention(ctx, api, o);
  await api
    .call('chat.postMessage', { channel: o.event.channel, text: o.text, ...AS_WRITTEN })
    .catch((e: unknown) => offlineFailed(ctx, 'chat.postMessage', e));
}
