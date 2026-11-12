import { AS_WRITTEN, SlackApi } from '@teamtrail/connector-slack/api';
import type { Envelope } from '@teamtrail/connector-slack/node';
import type { ServiceContext } from '../serviceContext';

export type Unreachable = 'not-linked' | 'offline';

const TEXT: Record<Unreachable, string> = {
  'not-linked':
    "Scout isn't connected to your Teamtrail yet. In the Lookout, open Settings → Slack and choose Add Scout to Slack.",
  offline: "Your Teamtrail isn't running, so Scout can't reach it. Start it and try again.",
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
  const workspace = await ctx.store.workspace(o.teamId);
  if (!workspace) return;
  const token = ctx.cipher.open(workspace.botToken, workspace.teamId);
  const api = new SlackApi({ token, apiUrl: ctx.config.slackApiUrl, fetch: ctx.fetch });
  await api
    .call('views.publish', { user_id: o.userId, view: { type: 'home', blocks: [section(o.text)] } })
    .catch(() => {});
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
      await respond(ctx, payload.response_url, text);
      return undefined;
    case 'events_api': {
      const event = (payload.event ?? {}) as Obj;
      const home = event.type === 'app_home_opened' && event.tab === 'home';
      if (home) await publishHome(ctx, { teamId: o.teamId, userId: o.userId, text });
      return undefined;
    }
    default: {
      const never: never = o.envelope.type;
      return never;
    }
  }
}
