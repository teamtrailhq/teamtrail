import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifySlackSignature } from '../crypto/verifySlackSignature';
import { BodyTooLarge, readBody } from '../http/readBody';
import { reply } from '../http/reply';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import { offlineReply } from './offlineReply';
import { toEnvelope, type SlackPath, type SlackRequest } from './toEnvelope';

type Delivery = Extract<SlackRequest, { kind: 'deliver' }>;

/** Whether this event was already passed on: Slack retries an event it thinks was missed; it must not act twice. */
function seen(recent: Set<string>, eventId: string | undefined) {
  if (!eventId) return false;
  if (recent.has(eventId)) return true;
  recent.add(eventId);
  if (recent.size > LIMITS.recentEvents) recent.delete(recent.values().next().value as string);
  return false;
}

/**
 * The links Slack's request goes to: the link that posted the message clicked on, when it is in the same
 * workspace, otherwise the links of the Slack account that acted.
 */
async function targets(ctx: ServiceContext, d: Delivery) {
  const poster = d.link ? await ctx.store.link(d.link) : undefined;
  if (poster && poster.teamId === d.teamId) return [poster.id];
  return (await ctx.store.linksOf(d.teamId, d.userId)).map((l) => l.id);
}

async function deliver(ctx: ServiceContext, d: Delivery) {
  if (seen(ctx.recentEvents, d.eventId)) return undefined;
  const workspace = await ctx.store.workspace(d.teamId);
  if (!workspace) return undefined;
  const links = await targets(ctx, d);
  const pending = links.length ? ctx.hub.deliver(links, d.envelope) : undefined;
  if (pending) return pending;
  const why = links.length ? 'offline' : 'not-linked';
  ctx.log('unreachable', { team: d.teamId, type: d.envelope.type, why });
  return offlineReply(ctx, { envelope: d.envelope, teamId: d.teamId, userId: d.userId, why });
}

async function uninstall(ctx: ServiceContext, teamId: string) {
  const links = await ctx.store.removeWorkspace(teamId);
  ctx.hub.revoke(links, 'uninstalled');
  ctx.log('uninstalled', { team: teamId, links: links.length });
}

/** What to answer Slack with for a verified request. */
async function answer(ctx: ServiceContext, r: SlackRequest): Promise<unknown> {
  switch (r.kind) {
    case 'challenge':
      return { challenge: r.challenge };
    case 'uninstall':
      await uninstall(ctx, r.teamId);
      return undefined;
    case 'deliver':
      return r.envelope.type === 'events_api' ? void deliver(ctx, r).catch(() => {}) : deliver(ctx, r);
    case 'ignore':
      return undefined;
    default: {
      const never: never = r;
      return never;
    }
  }
}

/**
 * Slack's request URLs. Every request must carry Slack's signature for this app; events are acked at once and
 * passed on, commands and clicks wait for the Teamtrail's ack (Slack allows 3 s).
 */
export async function handleSlack(ctx: ServiceContext, req: IncomingMessage, res: ServerResponse, path: SlackPath) {
  let body: string;
  try {
    body = await readBody(req);
  } catch (e) {
    return reply.empty(res, e instanceof BodyTooLarge ? 413 : 400);
  }
  const signed = verifySlackSignature({
    body,
    timestamp: req.headers['x-slack-request-timestamp'] as string | undefined,
    signature: req.headers['x-slack-signature'] as string | undefined,
    signingSecret: ctx.config.slackSigningSecret,
    now: ctx.now(),
  });
  if (!signed) {
    ctx.log('slack.unsigned', { path });
    return reply.empty(res, 401);
  }
  const ack = await answer(ctx, toEnvelope(path, body)).catch(() => undefined);
  if (ack === undefined || ack === null) return reply.empty(res);
  reply.json(res, 200, ack);
}
