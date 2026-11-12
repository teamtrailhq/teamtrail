import { AS_WRITTEN } from '@teamtrail/connector-slack/api';
import type { Envelope } from '@teamtrail/connector-slack/node';
import type { ServiceContext } from '../serviceContext';
import { botApi } from './botApi';
import { offlineFailed } from './offlineFailed';
import { replyToMessage } from './replyToMessage';
import { UNREACHABLE_TEXT } from './unreachableText';
import { welcomeHome } from './welcomeHome';

export type Unreachable = 'not-linked' | 'offline' | 'stale';

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
  const body = JSON.stringify({ response_type: 'ephemeral', replace_original: false, text, ...AS_WRITTEN });
  const res = await ctx
    .fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body })
    .catch(() => undefined);
  if (!res?.ok) ctx.log('offline.failed', { method: 'response_url', error: res ? `http_${res.status}` : 'offline' });
}

/** The Home tab says what Scout is, why it has nothing to show and how to get there, with the bot token. */
async function publishHome(ctx: ServiceContext, o: { teamId: string; userId: string; why: Unreachable }) {
  const api = await botApi(ctx, o.teamId);
  if (!api) return;
  await api
    .call('views.publish', { user_id: o.userId, view: welcomeHome(o.why) })
    .catch((e: unknown) => offlineFailed(ctx, 'views.publish', e));
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
  const text = UNREACHABLE_TEXT[o.why];
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
      if (home) await publishHome(ctx, { teamId: o.teamId, userId: o.userId, why: o.why });
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
