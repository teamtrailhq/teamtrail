import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifySlackSignature } from '../crypto/verifySlackSignature';
import { BodyTooLarge, readBody } from '../http/readBody';
import { reply } from '../http/reply';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import { isReplay } from './isReplay';
import { offlineReply } from './offlineReply';
import { resolveRoute } from './resolveRoute';
import { safeAck } from './safeAck';
import { toEnvelope, type SlackPath, type SlackRequest } from './toEnvelope';

type Delivery = Extract<SlackRequest, { kind: 'deliver' }>;
type Obj = Record<string, unknown>;

/** Whether this event was already passed on: Slack retries an event it thinks was missed; it must not act twice. */
function seen(recent: Set<string>, eventId: string | undefined) {
  if (!eventId) return false;
  if (recent.has(eventId)) return true;
  recent.add(eventId);
  if (recent.size > LIMITS.recentEvents) recent.delete(recent.values().next().value as string);
  return false;
}

/** A "Save as decision" shortcut lets the link that got it read that thread for a few minutes. */
async function grantThread(ctx: ServiceContext, d: Delivery, linkId: string) {
  const p = d.envelope.payload as Obj;
  if (p.type !== 'message_action') return;
  const channel = (p.channel as Obj | undefined)?.id;
  const message = (p.message ?? {}) as Obj;
  const expiresAt = ctx.now() + LIMITS.threadMs;
  for (const ts of new Set([message.ts, message.thread_ts]))
    if (typeof channel === 'string' && typeof ts === 'string')
      await ctx.store.mark({ kind: 'thread', key: `${channel}:${ts}`, linkId, expiresAt });
}

function unreachable(stale: boolean, links: number) {
  if (stale) return 'stale';
  return links ? 'offline' : 'not-linked';
}

async function deliver(ctx: ServiceContext, d: Delivery) {
  if (seen(ctx.recentEvents, d.eventId)) return undefined;
  if (!(await ctx.store.workspace(d.teamId))) return undefined;
  const targets = await resolveRoute(ctx, d);
  const ids = targets.kind === 'links' ? targets.ids : [];
  const socket = ctx.hub.pick(ids);
  if (socket?.link) {
    await grantThread(ctx, d, socket.link.id);
    ctx.log('deliver', { link: socket.link.id, type: d.envelope.type });
    return safeAck(d.envelope, await socket.deliver(d.envelope));
  }
  const why = unreachable(targets.kind === 'stale', ids.length);
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
 * Slack's request URLs. Every request must carry Slack's signature for this app, and a command or click is
 * handled once; events are acked at once and passed on, commands and clicks wait for the Teamtrail's ack
 * (Slack allows 3 s), which is filtered before it goes back to Slack (`safeAck`).
 */
export async function handleSlack(ctx: ServiceContext, req: IncomingMessage, res: ServerResponse, path: SlackPath) {
  let body: string;
  try {
    body = await readBody(req);
  } catch (e) {
    return reply.empty(res, e instanceof BodyTooLarge ? 413 : 400);
  }
  const signature = req.headers['x-slack-signature'] as string | undefined;
  const signed = verifySlackSignature({
    body,
    timestamp: req.headers['x-slack-request-timestamp'] as string | undefined,
    signature,
    signingSecret: ctx.config.slackSigningSecret,
    now: ctx.now(),
  });
  if (!signed) {
    ctx.log('slack.unsigned', { path });
    return reply.empty(res, 401);
  }
  if (path !== 'events' && isReplay(ctx, signature!)) {
    ctx.log('slack.replay', { path });
    return reply.empty(res);
  }
  const ack = await answer(ctx, toEnvelope(path, body)).catch(() => undefined);
  if (ack === undefined || ack === null) return reply.empty(res);
  reply.json(res, 200, ack);
}
