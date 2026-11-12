import { AS_WRITTEN } from '@teamtrail/connector-slack/api';
import type { Envelope } from '@teamtrail/connector-slack/node';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import { botApi } from './botApi';

export type Unreachable = 'not-linked' | 'offline' | 'stale';

const TEXT: Record<Unreachable, string> = {
  'not-linked':
    "Scout isn't connected to your Teamtrail yet. In the Lookout, open Settings → Slack and choose Add Scout to Slack.",
  offline: "Your Teamtrail isn't running, so Scout can't reach it. Start it and try again.",
  stale: 'This Scout message is no longer connected to a Teamtrail, so nothing was done.',
};

type Obj = Record<string, unknown>;

const section = (text: string) => ({ type: 'section', text: { type: 'mrkdwn', text, verbatim: true } });

/** Posts to a `response_url` only when it is Slack's own hooks address, never anywhere a payload names. */
async function respond(ctx: ServiceContext, url: unknown, text: string) {
  if (typeof url !== 'string') return;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }
  if (origin !== ctx.config.slackHooksOrigin) return;
  await ctx
    .fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ response_type: 'ephemeral', replace_original: false, text, ...AS_WRITTEN }),
    })
    .catch(() => {});
}

/** The Home tab says why Scout has nothing to show, published with the workspace's bot token. */
async function publishHome(ctx: ServiceContext, o: { teamId: string; userId: string; text: string }) {
  const api = await botApi(ctx, o.teamId);
  if (!api) return;
  const view = { type: 'home', blocks: [section(o.text)] };
  await api.call('views.publish', { user_id: o.userId, view }).catch(() => {});
}

/** Whether this person may be told again now: once a minute, so writing @Scout over and over gets one answer. */
function firstThisMinute(ctx: ServiceContext, key: string) {
  const now = ctx.now();
  const last = ctx.offlineSaid.get(key);
  if (last !== undefined && now - last < LIMITS.offlineReplyMs) return false;
  ctx.offlineSaid.set(key, now);
  if (ctx.offlineSaid.size > LIMITS.recentEvents) ctx.offlineSaid.delete(ctx.offlineSaid.keys().next().value as string);
  return true;
}

/**
 * A mention or DM whose Teamtrail can't take it: answered where it was asked, the mention privately in its thread,
 * the DM in that DM.
 */
async function replyToMessage(ctx: ServiceContext, o: { teamId: string; userId: string; event: Obj; text: string }) {
  if (!firstThisMinute(ctx, `${o.teamId}:${o.userId}`)) return;
  const api = await botApi(ctx, o.teamId);
  const channel = o.event.channel;
  if (!api || typeof channel !== 'string') return;
  if (o.event.type === 'app_mention') {
    const thread = o.event.thread_ts ?? o.event.ts;
    await api
      .call('chat.postEphemeral', { channel, user: o.userId, text: o.text, thread_ts: thread, ...AS_WRITTEN })
      .catch(() => {});
    return;
  }
  await api.call('chat.postMessage', { channel, text: o.text, ...AS_WRITTEN }).catch(() => {});
}

const modal = (text: string) => ({
  response_action: 'update',
  view: { type: 'modal', title: { type: 'plain_text', text: 'Scout' }, blocks: [section(text)] },
});

/**
 * Slack's request when the person's Teamtrail can't take it: the ack to answer Slack with, after telling the
 * person why in the place they acted (the command's reply, the modal, an ephemeral message or the Home tab).
 * Nothing is kept to deliver later.
 */
export async function offlineReply(
  ctx: ServiceContext,
  o: { envelope: Envelope; teamId: string; userId: string; why: Unreachable },
): Promise<unknown> {
  const text = TEXT[o.why];
  const payload = o.envelope.payload as Obj;
  switch (o.envelope.type) {
    case 'slash_commands':
      return { response_type: 'ephemeral', text };
    case 'interactive':
      if (payload.type === 'view_submission') return modal(text);
      if (payload.type === 'view_closed') return undefined;
      await respond(ctx, payload.response_url, text);
      return undefined;
    case 'events_api': {
      const event = (payload.event ?? {}) as Obj;
      const home = event.type === 'app_home_opened' && event.tab === 'home';
      if (home) await publishHome(ctx, { teamId: o.teamId, userId: o.userId, text });
      if (event.type === 'app_mention' || event.type === 'message')
        await replyToMessage(ctx, { teamId: o.teamId, userId: o.userId, event, text });
      return undefined;
    }
    default: {
      const never: never = o.envelope.type;
      return never;
    }
  }
}
